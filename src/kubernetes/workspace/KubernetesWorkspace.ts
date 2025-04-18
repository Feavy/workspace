import KubernetesComponent from "./KubernetesComponent";
import K8sObject from "../types/K8sObject";
import { createConfigMap, createDeployment, createIngress, createNamespace, createPersistentVolumeClaim, createService, createServiceAccount } from "../utils";
import { WorkspaceComponentConfig, WorkspaceConfig } from "../../config/types/WorkspaceConfig";
import KubernetesWorkspaceComponent from "./KubernetesWorkspaceComponent";
import KubernetesGatewayComponent from "./KubernetesGatewayComponent";
import { formatName } from "../utils/encoding";
import KubernetesOctServerComponent from "./KubernetesOctServerComponent";

export default class KubernetesWorkspace {
    public constructor(private readonly config: WorkspaceConfig) {
    }


    public name(...suffixes: string[]) {
        return formatName([this.config.name, "workspace", ...suffixes].join("-"));
    }

    public getResources(): Array<K8sObject> {
        const resources: Array<K8sObject> = [];
        resources.push(createNamespace(this.config.namespace));
        resources.push(...createServiceAccount({
            name: this.name("sa"),
            namespace: this.config.namespace,
            rules: [
                {
                    apiGroups: [""],
                    resources: ["pods", "services", "configmaps", "secrets"],
                    verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
                },
                {
                    apiGroups: ["apps"],
                    resources: ["deployments", "statefulsets", "daemonsets"],
                    verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
                },
                {
                    apiGroups: ["networking.k8s.io"],
                    resources: ["ingresses"],
                    verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
                },
                // {
                //     apiGroups: ["traefik.io"],
                //     resources: ["ingressroutes"],
                //     verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
                // }
            ]
        }));

        const workspaceComponent = new KubernetesWorkspaceComponent(this.config, this.config.workspace);
        const gatewayComponent = new KubernetesGatewayComponent(this.config, this.config.gateway, [workspaceComponent.config, ...this.config.components] as WorkspaceComponentConfig[]);
        const kubernetesComponents = [
            ...this.config.components.map(componentConfig => new KubernetesComponent(this.config, componentConfig as WorkspaceComponentConfig)),
            new KubernetesOctServerComponent(this.config),
            workspaceComponent,
            gatewayComponent,
        ];

        const configs = kubernetesComponents.flatMap(component => component.config);

        const pvc = resources.pushAndGet(createPersistentVolumeClaim({
            name: this.name("pvc"),
            namespace: this.config.namespace,
            size: this.config.pvc.size,
            accessModes: ["ReadWriteOnce"],
            storageClassName: this.config.pvc.storageClassName,
        }));

        const containers = kubernetesComponents.flatMap(component => component.containerDefinition);

        const deployment = resources.pushAndGet(createDeployment({
            name: this.name("deployment"),
            namespace: this.config.namespace,
            containers: containers,
            nodeSelector: this.config.nodeSelector,
            replicas: 1,
            volume: pvc
        }));

        for (const component of kubernetesComponents) {
            resources.push(...component.getResources(resources));
        }

        // ports exposed as clusterip service
        // ports of server + ports of components which have ingress and auth = false
        const ports = [...gatewayComponent.ports,
        ...configs.flatMap(it => (it as WorkspaceComponentConfig).ports)
            .filter(port => port.ingress !== undefined && !port.ingress?.auth)
        ];

        const service = resources.pushAndGet(createService({
            name: this.name("clusterip"),
            namespace: this.config.namespace,
            ports: ports.map(port => ({
                name: port.name,
                protocol: port.protocol,
                number: port.number,
                exposed: true
            })),
            deployment: deployment
        }));

        // Auth ingress
        const authIngresses = configs.flatMap(it => it.ports)
            .filter(port => port.ingress !== undefined && port.ingress?.auth)
            .map(port => port.ingress)
            .sort((a, b) => b!.subdomain.length + b!.path.length - (a!.subdomain.length + a!.path.length));

        resources.pushAndGet(createIngress({
            name: this.name("auth-ingress"),
            namespace: this.config.namespace,
            rules: uniqueBy(authIngresses, it => this.getHost(it.subdomain)).map(ingress => ({
                host: this.getHost(ingress.subdomain),
                port: KubernetesGatewayComponent.PORT,
                path: "/",
                service: service // ?
            }))
        }));

        // Public ingress
        const publicPorts = configs.flatMap(it => it.ports)
            .filter(port => port.ingress !== undefined && !port.ingress?.auth)
            .sort((a, b) => b.ingress!.subdomain.length + b.ingress!.path.length - (a.ingress!.subdomain.length + a.ingress!.path.length));

        resources.pushAndGet(createIngress({
            name: this.name("public-ingress"),
            namespace: this.config.namespace,
            rules: publicPorts.map(port => ({
                host: this.getHost(port.ingress?.subdomain || ""),
                port: port.number,
                protocol: port.protocol,
                path: port.ingress?.path || "/",
                service: service // ?
            }))
        }));

        resources.push(createConfigMap({
            name: this.name("state"),
            namespace: this.config.namespace,
            data: {
                "state": JSON.stringify(resources.map(it => ({
                    apiVersion: it.apiVersion,
                    kind: it.kind,
                    metadata: {
                        name: it.metadata?.name,
                        namespace: it.metadata?.namespace
                    }
                })))
            }
        }));


        return resources;
    }

    public getHost(subdomain?: string) {
        let domain = this.config.domain.replace("%s", subdomain || "");
        if (!subdomain) {
            domain = domain.substring(1); // remove separator
        }
        return domain;
    }
}

function uniqueBy(array: any[], fun: (elem: any) => any) {
    return array.filter((item, pos) => array.findIndex(it => fun(it) === fun(item)) == pos);
}