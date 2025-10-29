# Testkube Local Development with Tilt

This project provides a local development environment for running Testkube workflows using Tilt, enabling fast iteration on tests and services.

## Prerequisites

### Required Tools

* **Minikube** - Local Kubernetes cluster - https://minikube.sigs.k8s.io/
* **Tilt** - Development workflow automation - https://tilt.dev
* **Helm** - Kubernetes package manager - https://helm.sh/
* **Kubectl** - Kubernetes CLI
* **Testkube** - Testkube - https://testkube.io/ 
* **Testkube CLI** - Testkube CLI - https://docs.testkube.io/articles/cli 

### Setup Requirements

Before using this project, ensure:

1. **Minikube is running** - Required k8s context: `minikube`
2. **Testkube CLI is installed and you are authenticated with your Testkube Environment** - Use `testkube login` to authenticate
3. **Testkube Runner Agent is deployed** - Deploy a Testkube Runner Agent as described at https://docs.testkube.io/articles/agents-overview and provide the name and namespace in the corresponding configuration values below.

## Configuration

The Tiltfile can be customized via constants at the top:

```python
AGENT_NAMESPACE = 'minikube-runner-1'   # namespace where local Testkube Runner Agent runs
RUNNER_AGENT_NAME = 'minikube-runner-1' # name of the local runner agent - usually the same as the namespace
KUBE_CONTEXT = 'minikube'               # your local minikube k8s context
WORKFLOW_DIR = 'workflows'              # where workflow yamls live
SERVICE_ROOT = 'services'               # code folders that should trigger runs
AUTO_RUN = True                         # True -> automatically rerun Workflows when tests are updated
AUTO_DELETE = False                     # True -> automatically delete Workflows from Environment when they are deleted in the filesystem
RUN_SILENTLY = True                     # True -> run Testkube executions silently
EXECUTION_TAGS = 'local-dev=true'       # tags to add to executions triggered locally
```

## How It Works

The Tiltfile automatically:

1. **Checks prerequisites**:
   - That the specified KUBE_CONTEXT is set
   - That the Testkube CLI is installed
   - That the Testkube Context is configured for an Environment
   - That the Testkube Runner Agent is installed in the specified namespace

2. **Watches for changes** in:
   * `WORKFLOW_DIR/*.yaml` - TestWorkflow definitions
   * `SERVICE_ROOT/<service-name>/` - Service code directories

3. **Creates Tilt resources** for each workflow:
   * **Update Workflow** - Applies workflow changes to Testkube (auto-applies on file change)
   * **Run Workflow** - Executes the workflow on the local runner (auto-runs on code changes)

4. **Targets local agent** - All workflow executions triggered by Tilt automatically 
   - target the `RUNNER_AGENT_NAME` runner agent.
   - add the defined `EXECUTION_TAGS` for easy filtering in the Testkube Dashboard 
   - run silently if `RUN_SILENTLY` is `TRUE`; these executions will not trigger webhooks/events or skew Health and Insights metrics.

5. **Provides local dev overrides** - Creates a TestWorkflowTemplate (`minikube-local-dev-override`) that mounts the root folder into Minikube 
   so it can be used to override repository content when running tests, see the [Configuration Example](#workflow-configuration-example) below.

## Usage

### Start Development Environment

Starts Tilt UI and watches for changes:

```bash
tilt up
```

### Stop Development Environment

Stops Tilt and cleans up:

```bash
tilt down
```

### View Status/Admin

The Tiltfile provides manual trigger buttons:

* **Testkube Runner Agent Status** - View cluster and pod status of the Testkube Runner Agent in the AGENT_NAMESPACE
* **Testkube Status** - Check Testkube connectivity
* **Testkube Dashboard** - Open Testkube dashboard in browser
* **Mount local test folder into Minikube** - Mount local filesystem into minikube at `/minikube-host/testkube-local-dev`, this is to enable 
  the TestWorkflowTemplate to override test contents cloned from git with files in the local repo.

## Project Structure

```text
.
├── services/             # Service code directories -> Tilt will watch this directory for changes to run tests if `AUTO_RUN` is set
│   └── api/              # Example API service with tests
├── workflows/            # TestWorkflow definitions -> Tilt will automatically add/update these Workflows to your Environment
│   ├── api/             
│   │   └── api.yaml     # API test workflow
│   └── frontend/
│       ├── e2e.yaml     # E2E test workflow
│       └── example-1.yaml
└── Tiltfile             # Tilt configuration
```

## Local Development Flow

1. **Start Tilt**: `tilt up`
2. **Edit code** in `services/<service>/`
3. **Workflow automatically re-runs** with your changes
4. **View results** in Tilt UI or Testkube dashboard
5. **Iterate** - Any file change triggers a new run

## Workflow Configuration Example

Workflows will need to be modified to use the `minikube-local-dev-override` template to use local code when tests are executed:

```yaml
apiVersion: testworkflows.testkube.io/v1
kind: TestWorkflow
metadata:
  name: my-test
spec:
  use:
  - name: minikube-local-dev-override
    config:
      workingDir: /services/api/tests  # Mount local code here
  content:
    git:
      uri: https://github.com/yourorg/yourrepo
      revision: main
      paths:
        - services/api
  # ... rest of workflow definition
```

The template injects a step in the beginning of the Workflow that looks for the mounted folder/directory and copies
files from there into the cloned /data/repo folder, effectivly overwriting any git content with local files (including deletes).

If the mount is not available the template will fail silently.

## WorkflowTemplate for local override

The Tiltfile automatically creates/updates a TestWorkflowTemplate in your configured Testkube Environment that overrides 
git repository context from the Minikube Mount created by the "Mount Tests into Testkube" Resource.

The Template is as follows:

```yaml
kind: TestWorkflowTemplate
apiVersion: testworkflows.testkube.io/v1
metadata:
  name: minikube-local-dev-override
  namespace: testkube
spec:
  config:
    workingDir: # required to specify which folder that contain the tests, to avoid replacing the entire repo
      type: string
  pod:
    volumes:
    - name: hostshare
      hostPath:
        path: /minikube-host/testkube-local-dev # this is the folder mounted into Minikube
        type: DirectoryOrCreate
  setup:
  - name: Overwrite from local
    optional: true # optional steps are ignored if they fail, i.e. if the mount or specified folder isn't available
    container:
      image: busybox
      volumeMounts:
      - name: hostshare
        mountPath: /data/local # makes the mounted folder available to the Workflow
    shell: | 
      # check if mounted volume folder exists
      [ -d "/data/local{{ config.workingDir }}" ] || { echo "Folder /data/local{{ config.workingDir }} for local override not found!"; exit 1; }

      # delete existing tests (to correctly mirror deleted tests) and copy local tests into repo
      rm -rf /data/repo{{ config.workingDir }}
      cp -rfv /data/local{{ config.workingDir }} /data/repo{{ config.workingDir }}
```
