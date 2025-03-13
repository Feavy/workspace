import WorkspaceConfigRenderer from './config/WorkspaceConfigRenderer';
import { fromError } from 'zod-validation-error';
import KubernetesWorkspace from './kubernetes/KubernetesWorkspace';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';
import { lib } from "lib";
import KubernetesClient from "./kubernetes/KubernetesClient";
import {dataValuesFromBase64} from "./kubernetes/utils/base64";

/*
CLI Parameters:
--regenerate -r: Regenerate passwords
 */

dotenv.config();

const isDev = process.env['NODE_ENV'] === 'development';
if(isDev) {
    process.chdir("../../");
}

console.log(lib());

(async () => {
    try {
        const configRenderer = new WorkspaceConfigRenderer('workspace.yml');
        const client = new KubernetesClient(configRenderer.ymlConfig.namespace);
        let existingSecret: Record<string, string> = {};
        if(!process.argv.includes('--regenerate') && await client.workspaceExists()) {
            const secret = await client.getSecret('workspace-secrets');
            if(secret) existingSecret = dataValuesFromBase64(secret.data || {});
        }

        const workspaceConfig = configRenderer.render(existingSecret);

        // console.log(yaml.stringify(workspaceConfig));

        const kubernetesWorkspace = new KubernetesWorkspace(workspaceConfig);
        const resources = kubernetesWorkspace.getResources();
        console.log(resources.map(resource => yaml.stringify(resource)).join('---\n'));
    } catch (error: any) {
        const validationError = fromError(error);
        console.error(error);
        console.error(validationError.toString());
    }
})();
