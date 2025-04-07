import * as K8SUtils from "../utils";
import K8sObject from "../types/K8sObject";
import { ContainerDefinition } from "../utils/createDeployment";
import { WorkspaceComponentConfig, WorkspaceConfig } from "../../config/types/WorkspaceConfig";
import { formatName } from "../utils/encoding";

export default class KubernetesComponent {
    public constructor(protected readonly mainConfig: WorkspaceConfig, protected readonly config: WorkspaceComponentConfig) {
    }

    public name(...suffixes: string[]) {
        return formatName([this.mainConfig.name, this.config.name, ...suffixes].join("-"));
    }

    public get ports() {
        return this.config.ports;
    }

    public get env() {
        return this.config.env;
    }

    public get configMap() {
        return this.config.env && K8SUtils.createConfigMap({
            name: this.name("config"),
            namespace: this.mainConfig.namespace,
            data: this.config.env
        });
    }

    public get secret() {
        return this.config.secrets && K8SUtils.createSecret({
            name: this.name("secret"),
            namespace: this.mainConfig.namespace,
            stringData: this.config.secrets
        });
    }

    public get persistentVolumeClaims() {
        return this.config.volumes && this.config.volumes.map(volume => K8SUtils.createPersistentVolumeClaim({
            name: this.name("pvc", volume.name),
            namespace: this.mainConfig.namespace,
            size: volume.size,
            mountPath: volume.mountPath,
            accessModes: ["ReadWriteOnce"],
            storageClassName: "openebs-hostpath",
        })) || [];
    }

    public get containerDefinition(): ContainerDefinition {
        return {
            name: this.name(),
            image: this.config.image + ":" + this.config.tag,
            configMap: this.configMap,
            secret: this.secret,
            ports: this.config.ports.map(port => ({
                name: port.name,
                protocol: port.protocol,
                number: port.number,
                exposed: Boolean(port.ingress)
            })),
            volumes: this.persistentVolumeClaims,
        }
    };

    public getResources(definedResources: Array<K8sObject>): Array<K8sObject> {
        return [this.configMap, this.secret, ...this.persistentVolumeClaims].filter(Boolean) as Array<K8sObject>;
    }
}