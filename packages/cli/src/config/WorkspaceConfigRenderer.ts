import * as fs from 'fs';
import * as yaml from 'yaml';
import { DependencyInclude, ScriptInclude, workspaceSchema, WorkspaceFileYaml, App } from './types/WorkspaceFileSchema';
import { dependencyFileSchema } from './types/DependencyFileSchema';
import { scriptFileSchema } from './types/ScriptFileSchema';
import YamlRenderer from './YamlRenderer';
import {map, toArray} from "../utils/ObjectUtils";
import {componentToWorkspaceComponent, WorkspaceConfig} from "./types/WorkspaceConfig";
import { Component, Ingress } from './types/ComponentSchema';

export default class WorkspaceConfigRenderer {
    public ymlConfig: WorkspaceFileYaml;
    private existingSecrets: Record<string, string> = {};

    public constructor(workspaceFile: string) {
        const workspaceYml = fs.readFileSync(workspaceFile, 'utf8');
        this.ymlConfig = yaml.parse(workspaceYml);
    }

    public render(existingSecrets: Record<string, string>) {
        this.existingSecrets = existingSecrets;

        this.ymlConfig = this.renderYaml(this.ymlConfig);
        this.ymlConfig = workspaceSchema.parse(this.ymlConfig);

        this.ymlConfig.app.initScripts = this.ymlConfig.app.initScripts.map((script) => "include" in script ? this.renderScriptInclude(script) : script);
        this.ymlConfig.dependencies = Object.fromEntries(Object.entries(this.ymlConfig.dependencies)
                                        .flatMap(([key, value]) => "include" in value ? this.renderDependencyInclude(value, key) : [[key, value]]));

        this.ymlConfig = this.renderYaml(this.ymlConfig);

        const components: (Component & { name: string })[] = [{...this.ymlConfig.app, name: "app"}, ...toArray(this.ymlConfig.dependencies, 'name')];

        const config: WorkspaceConfig = {
            version: this.ymlConfig.version,
            namespace: this.ymlConfig.namespace,
            repositories: this.ymlConfig.repositories,
            nodeSelector: this.ymlConfig.nodeSelector,
            app: componentToWorkspaceComponent({
                ...this.ymlConfig.app,
                name: "app",
                namespace: this.ymlConfig.namespace,
                firebaseServiceAccountKey: this.ymlConfig.firebaseServiceAccountKey,
                domain: this.ymlConfig.domain,
                subdomainFormat: this.ymlConfig.subdomainFormat,
                ingresses: components.flatMap(component => Object.values(component.ports || {})).map(port => port.ingress).filter(Boolean) as Ingress[],
            }),
            components: components.map((component) => componentToWorkspaceComponent({
                ...component,
                name: component.name,
                namespace: this.ymlConfig.namespace,
                secrets: this.ymlConfig.secrets
            })),
            secrets: this.ymlConfig.secrets,
        }

        return config;
    }

    public renderDependencyInclude(include: DependencyInclude, key: string) {
        const {components} = YamlRenderer.fromFile(include.include, dependencyFileSchema)
            .with({
                args: include.args,
                components: include.components
            })
            .withFunction("host", (host: string) => `{{ host('${key}.${host}') }}`)
            .render();
        return Object.entries(components).map(([name, component]) => [key + "." + name, component]);
    }

    public renderScriptInclude(include: ScriptInclude) {
        const {title, script} = YamlRenderer.fromFile(include.include, scriptFileSchema)
            .with({ args: include.args })
            .render();
        return {title, script};
    }

    private renderYaml(yaml: any) {
        return YamlRenderer.fromObject(yaml)
          .with({ env: process.env })
          .withFunction("randomPassword", this.randomPassword)
          .withFunction("host", this.host.bind(this))
          .preRenderOrFail("secrets")
          .renderOrFail();
    }


    public randomPassword = (length: number = 32) => (path: string) => {
        const key = path.replace("secrets.", "");
        if(key in this.existingSecrets) {
            return this.existingSecrets[key];
        }
        const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    }

    public host(host: string) {
        return `${host.replace(".", "-")}.${this.ymlConfig.namespace}.svc.cluster.local`;
    }
}