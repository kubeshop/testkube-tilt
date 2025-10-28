# =========================
# Config
# =========================
AGENT_NAMESPACE = 'minikube-runner-1'   # namespace where local Testkube Runner Agent runs
KUBE_CONTEXT_REQUIRED = 'minikube'      # your local minikubek8s context
AUTO_RUN = True                        # False -> manual run buttons only
WORKFLOW_DIR = 'workflows'              # where workflow yamls live
SERVICE_ROOT = 'services'               # code folders that should trigger runs
RUNNER_AGENT_NAME = 'minikube-runner-1' # name of the local runner agent to use when targeting
RUN_SILENTLY = True                     # True -> the workflow will run silently (no webhooks will be sent)
EXECUTION_TAGS = 'local-dev=true'       # tags to apply to triggered workflow executions

# extract host network address from minikube ssh so we can use it to target the host network when running workflows
HOST_NETWORK_ADDRESS = str(local(
    'bash -lc "minikube ssh -- grep host.docker.internal /etc/hosts 2>/dev/null | awk \'{print $1}\' || echo host.minikube.internal"',
    quiet=True
)).strip() or 'host.minikube.internal'

print("Host network address: %s" % HOST_NETWORK_ADDRESS)

# make sure we're using the correct k8s context
allow_k8s_contexts(KUBE_CONTEXT_REQUIRED)

# =========================
# Prerequisites check
# =========================
def check_prerequisites():
    """Check that Testkube helm charts are installed in the expected namespace"""
    helm_check_cmd = "helm list --namespace %s -o json | jq '.[] | select(.chart | startswith(\"testkube\"))'" % AGENT_NAMESPACE
    result = local(helm_check_cmd, quiet=True)
    result_str = str(result).strip()
    
    if not result_str:
        fail("""
Prerequisite check failed!

Expected to find Testkube helm charts in namespace '%s' but none were found.

To fix this:
1. Ensure Testkube is installed in namespace '%s'
2. Run: helm list --namespace %s
""" % (AGENT_NAMESPACE, AGENT_NAMESPACE, AGENT_NAMESPACE))
    else:
        print("✓ Prerequisite check passed: Testkube Runner Agent found in namespace '%s'" % AGENT_NAMESPACE)

check_prerequisites()

# =========================
# Helpers
# =========================
def service_from_workflow(path):
    # workflows/<service>.yaml  -> <service>
    # workflows/<service>/<file>.yaml -> <service>
    parts = path.split('/')
    if len(parts) >= 2 and parts[0] == WORKFLOW_DIR:
        if len(parts) == 2:
            base = parts[1]
            return base[:-5] if base.endswith('.yaml') else base
        return parts[1]
    return 'unknown'

def list_workflow_files():
    # shell globs to enumerate workflow files (single + nested)
    out = str(local(
        'bash -lc "ls -1 %s/*.yaml 2>/dev/null; ls -1 %s/*/*.yaml 2>/dev/null || true"' % (WORKFLOW_DIR, WORKFLOW_DIR),
        quiet=True
    ))
    files = [l for l in out.splitlines() if l.strip() != '']
    return sorted(files)

def sanitize_id(s):
    # Tilt resource names may not contain '/'
    # also avoid dots for neatness
    return s.replace('/', '__').replace('.', '_')

def res_id(prefix, service, wf_path):
    return '%s (%s:%s)' % (prefix, service, sanitize_id(wf_path))

def extract_resource_name(yaml_path):
    result = read_yaml( yaml_path ).get('metadata', {}).get('name', None)
    return result

# =========================
# Wire workflows
# =========================
wf_files = list_workflow_files()
if not wf_files:
    local_resource('no-workflows-found', 'echo "No workflow YAMLs found in %s/ or %s/*/"' % (WORKFLOW_DIR, WORKFLOW_DIR))
else:
    for wf in wf_files:
        service = service_from_workflow(wf)

        # Watch the workflow file + the whole service directory
        service_dir = '%s/%s' % (SERVICE_ROOT, service)
        workflow_name = extract_resource_name(wf)

        # 1) Apply whenever deps change
        apply_name = res_id('Update Workflow %s' % workflow_name, service, wf)
        local_resource(
            apply_name,
            'bash -lc "set -euo pipefail; testkube create testworkflow --update -f %s"' % wf,
            deps=[wf],
            allow_parallel=True,
            labels=['update'],
        )

        # 2) Run: resolve the workflow name at runtime from the cluster (works for single or list)
        run_cmd = """
        bash -lc 'set -euo pipefail;
echo "Running workflow %s on local runner: %s"
testkube run testworkflow "%s" --target name=%s -f --tag %s --variable HOST_NAME=%s %s
'""" % (workflow_name, RUNNER_AGENT_NAME, workflow_name, RUNNER_AGENT_NAME, EXECUTION_TAGS, HOST_NETWORK_ADDRESS, (RUN_SILENTLY and '--disable-webhooks' or ''))

        run_name = res_id('Run Workflow %s' % workflow_name, service, wf)
        local_resource(
            run_name,
            run_cmd,
            trigger_mode=TRIGGER_MODE_AUTO if AUTO_RUN else TRIGGER_MODE_MANUAL,
            resource_deps=[apply_name],
            deps=[service_dir],
            allow_parallel=True,
            labels=['execute'],
        )

# =========================
# Global buttons
# =========================
local_resource(
    'Minikube Status',
    'bash -lc "kubectl get nodes -o wide && kubectl -n %s get pods -o wide"' % AGENT_NAMESPACE,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
)

local_resource(
    'Testkube Status',
    'bash -lc "testkube status"',
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
)

local_resource(
    'Testkube Dashboard',
    'bash -lc "testkube dashboard -n %s"' % AGENT_NAMESPACE,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
    links=[link(
    'https://docs.testkube.io',
    'Testkube Docs',
)]
)

local_resource(
    'Mount local test folder into Minikube',
    serve_cmd='bash -lc "minikube mount ./:/minikube-host/testkube-local-dev"',
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
)

# ==================================================
# Create TestWorkflowTemplate for local dev override
# ==================================================

# Example helper function
def create_local_dev_override_workflow_template(resource_yaml):

    # Use mktemp to create a temporary file with cleanup
    cmd = """
    bash -lc 'set -euo pipefail;
TMPFILE=$(mktemp /tmp/tilt-XXXXXX.yaml)
cat > "$TMPFILE" << 'EOF'
%s
EOF
echo "Applying inline resource..."
testkube create testworkflowtemplate -f "$TMPFILE" --update
rm -f "$TMPFILE"
'""" % (resource_yaml)
    
    return local_resource(
        "Create Local Dev Override WorkflowTemplate",
        cmd,
        trigger_mode=TRIGGER_MODE_MANUAL,
        labels=['admin'],
    )

# WorkflowTemplate YAML
template_yaml = """
kind: TestWorkflowTemplate
apiVersion: testworkflows.testkube.io/v1
metadata:
  name: minikube-local-dev-override
  namespace: testkube
spec:
  config:
    workingDir:
      type: string
  pod:
    volumes:
    - name: hostshare
      hostPath:
        path: /minikube-host/testkube-local-dev
        type: DirectoryOrCreate
  setup:
  - name: Overwrite from local
    optional: true
    container:
      image: busybox
      volumeMounts:
      - name: hostshare
        mountPath: /data/local
    shell: |
      # check if mounted volume folder exists
      [ -d "/data/local{{ config.workingDir }}" ] || { echo "Folder /data/local{{ config.workingDir }} for local override not found!"; exit 1; }

      # delete existing tests (to correctly mirror deleted tests) and copy local tests into repo
      rm -rf /data/repo{{ config.workingDir }}
      cp -rfv /data/local{{ config.workingDir }} /data/repo{{ config.workingDir }}

"""

# Create the WorkflowTemplate for local dev override
create_local_dev_override_workflow_template(template_yaml)

