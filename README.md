# Testkube Local Development with Tilt

This project provides a local development environment for running Testkube workflows using Tilt, enabling fast iteration on tests and services.

## Prerequisites

### Required Tools

* **minikube** - Local Kubernetes cluster
* **tilt** - Development workflow automation
* **helm** - Kubernetes package manager
* **kubectl** - Kubernetes CLI
* **testkube** - Testkube CLI

### Setup Requirements

Before using this project, ensure:

1. **Testkube is installed** - The Tiltfile checks for Testkube helm charts in the `minikube-runner-1` namespace
2. **Minikube is running** - Required k8s context: `minikube`
3. **Testkube Runner Agent is deployed** - Name: `minikube-runner-1` in namespace `minikube-runner-1`

## Configuration

The Tiltfile can be customized via constants at the top:

```python
AGENT_NAMESPACE = 'minikube-runner-1'   # namespace where local Testkube Runner Agent runs
KUBE_CONTEXT_REQUIRED = 'minikube'      # your local minikube k8s context
AUTO_RUN = True                         # False -> manual run buttons only
WORKFLOW_DIR = 'workflows'              # where workflow yamls live
SERVICE_ROOT = 'services'              # code folders that should trigger runs
RUNNER_AGENT_NAME = 'minikube-runner-1' # name of the local runner agent
RUN_SILENTLY = True                     # True -> no webhooks sent
EXECUTION_TAGS = 'local-dev=true'       # tags to apply to executions
```

## How It Works

The Tiltfile automatically:

1. **Watches for changes** in:
   * `workflows/*.yaml` - TestWorkflow definitions
   * `workflows/*/*.yaml` - Nested workflow files
   * `services/<service-name>/` - Service code directories

2. **Creates Tilt resources** for each workflow:
   * **Update Workflow** - Applies workflow changes to Testkube (auto-applies on file change)
   * **Run Workflow** - Executes the workflow on the local runner (auto-runs on code changes)

3. **Targets local agent** - All workflows target `minikube-runner-1` in namespace `minikube-runner-1`

4. **Provides local dev overrides** - Creates a TestWorkflowTemplate (`minikube-local-dev-override`) that mounts local code over repository content

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

* **Minikube Status** - View cluster and pod status
* **Testkube Status** - Check Testkube connectivity
* **Testkube Dashboard** - Open Testkube dashboard in browser
* **Mount local test folder into Minikube** - Mount local filesystem into minikube at `/minikube-host/testkube-local-dev`

## Project Structure

```text
.
├── services/              # Service code directories
│   └── api/              # Example API service with tests
├── workflows/            # TestWorkflow definitions
│   ├── api/             
│   │   └── api.yaml     # API test workflow
│   └── frontend/
│       ├── e2e.yaml     # E2E test workflow
│       └── example-1.yaml
└── Tiltfile             # Tilt configuration
```

## Workflow Configuration Example

Workflows can use the local dev override template to mount local code:

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

## Local Development Flow

1. **Start Tilt**: `tilt up`
2. **Edit code** in `services/<service>/`
3. **Workflow automatically re-runs** with your changes
4. **View results** in Tilt UI or Testkube dashboard
5. **Iterate** - Any file change triggers a new run

## Best Practices for Testkube

This setup helps document and share:

* Local development workflows with Testkube
* Fast feedback loops for test development
* Integration with existing CI/CD pipelines
* Runner agent configuration and targeting
