import 'dotenv/config';
import './utils/ArrayUtils';
import WorkspaceConfigRenderer from './config/WorkspaceConfigRenderer';
import { fromError } from 'zod-validation-error';
import KubernetesWorkspace from './kubernetes/workspace/KubernetesWorkspace';
import * as dotenv from 'dotenv';
import KubernetesClient from "./kubernetes/KubernetesClient";
import {dataValuesFromBase64} from "./kubernetes/utils/encoding";
import KubernetesWorkspaceComponent from './kubernetes/workspace/KubernetesWorkspaceComponent';

/*
CLI Parameters:
--regenerate -r: Regenerate passwords
 */

dotenv.config();

(async () => {
    try {
        const configRenderer = new WorkspaceConfigRenderer('workspace.yml');
        const client = new KubernetesClient(configRenderer.ymlConfig.namespace);
        let existingSecret: Record<string, string> = {};
        if(!process.argv.includes('--regenerate') && await client.workspaceExists()) {
            const secret = await client.getSecret('workspace-secrets');
            if(secret) existingSecret = dataValuesFromBase64(secret.data || {});
        }

        const workspaceConfig = await configRenderer.render(existingSecret);

        // console.log(yaml.stringify(workspaceConfig));

        const kubernetesWorkspace = new KubernetesWorkspace(workspaceConfig);
        const resources = kubernetesWorkspace.getResources();
        // console.log(resources.map(resource => yaml.stringify(resource)).join('---\n'));

        console.log("Deploying workspace...");
        await client.deploy(kubernetesWorkspace, true);
        console.log("Workspace deployed successfully!");
        console.log("Available at https://" + kubernetesWorkspace.getHost(KubernetesWorkspaceComponent.NAME));
    } catch (error: any) {
        const validationError = fromError(error);
        console.error(error);
        console.error(validationError.toString());
    }
})();
