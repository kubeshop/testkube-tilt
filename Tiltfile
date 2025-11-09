load('ext://uibutton', 'cmd_button', 'location', 'text_input')

# =========================
# Config
# =========================
AGENT_NAMESPACE = 'minikube-runner-1'   # namespace where local Testkube Runner Agent runs
RUNNER_AGENT_NAME = 'minikube-runner-1' # name of the local runner agent - usually the same as the namespace
KUBE_CONTEXT = 'minikube'               # your local minikube k8s context
WORKFLOW_DIR = 'workflows'              # where workflow yamls live -> Tilt will automatically add/update these Workflows to your Environment
SERVICE_ROOT = 'services'               # code folders that should trigger runs -> Tilt will watch this directory for changes to run tests if `AUTO_RUN` is set
AUTO_RUN = True                         # True -> automatically rerun Workflows when tests are updated
AUTO_DELETE = False                     # True -> automatically delete Workflows from Environment when they are deleted in the WORKFLOW_DIR
RUN_SILENTLY = True                     # True -> run Testkube executions silently
EXECUTION_TAGS = 'local-dev=true'       # tags to add to Workflow executions triggered by Tilt

# extract host network address from minikube ssh so we can use it to target the host network when running workflows
HOST_NETWORK_ADDRESS = str(local(
    'minikube ssh -- grep host.docker.internal /etc/hosts 2>/dev/null | awk \'{print $1}\' || echo host.minikube.internal',
    quiet=True
)).strip() or 'host.minikube.internal'

print("✓ Host network address: %s" % HOST_NETWORK_ADDRESS)

# make sure we're using the correct k8s context
allow_k8s_contexts(KUBE_CONTEXT)
local( "kubectl config use-context %s" % KUBE_CONTEXT )

# ===========================================================================
# CLI Prerequisites check for Testkube CLI
# ==================================================
"""Check that Testkube CLI is available"""
testkube_cli_check = local("which testkube || command -v testkube", quiet=True)
if not str(testkube_cli_check).strip():
    fail("""
Testkube CLI not found!

The Testkube CLI is required but not found in PATH.

To fix this:
1. Install the Testkube CLI: https://docs.testkube.io/cli/install
2. Ensure it's in your PATH: which testkube
""")
else:
    print("✓ Testkube CLI found: %s" % str(testkube_cli_check).strip())

# ===========================================================================
# CLI Prerequisites check for Testkube environment
# ===========================================================================
"""Check that user is logged in to a Testkube environment"""
testkube_context_check = local("testkube get context 2>&1", quiet=True)
context_output = str(testkube_context_check).strip()

if (not context_output or 
    "Your current context is set to" not in context_output):
    print("Testkube Context: %s" % context_output)
    fail("""
Testkube login check failed!

You are not logged in to a Testkube environment.

To fix this:
1. Run: testkube login
2. Verify with: testkube get context
""")
else:
    print("✓ Testkube authentication: user seems to be logged in")

# ===========================================================================
# Prerequisites check for Testkube Runner Agent helm charts
# ===========================================================================
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

If you don't have a Testkube Runner Agent deployed in the %s namespace, you can deploy one by running:

testkube install agent %s --runner --create

""" % (AGENT_NAMESPACE, AGENT_NAMESPACE, AGENT_NAMESPACE, AGENT_NAMESPACE, AGENT_NAMESPACE))
else:
    print("✓ Prerequisite check passed: Testkube Runner Agent found in namespace '%s'" % AGENT_NAMESPACE)

# ==================================================
# Define Helper Functions
# ==================================================
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
    # Use find to discover workflow files at depth 1 and 2
    out = str(local(
        'find %s -maxdepth 2 -name "*.yaml" -type f 2>/dev/null | sort' % WORKFLOW_DIR,
        quiet=True
    ))
    return [l.strip() for l in out.splitlines() if l.strip()]
    
def sanitize_id(s):
    # Tilt resource names may not contain '/'
    # also avoid dots for neatness
    return s.replace('/', '__').replace('.', '_')

def res_id(prefix, service, wf_path):
    return '%s (%s:%s)' % (prefix, service, sanitize_id(wf_path))

def extract_resource_name(yaml_path):
    result = read_yaml( yaml_path ).get('metadata', {}).get('name', None)
    return result

# ===========================================================================
# Wire Testkube Workflows to corresponding execute and update resources
# ===========================================================================
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

        apply_cmd = ("""
bash -c 'set -euo pipefail;
if [ ! -f "%s" ]; then
    echo "Workflow file deleted: %s - deleting workflow %s"
    testkube delete testworkflow "%s" || echo "Workflow %s may not exist (already deleted or never created)"
else
    echo "Updating workflow %s from file: %s"
    testkube create testworkflow --update -f "%s"
fi
'""" % (wf, wf, workflow_name, workflow_name, workflow_name, workflow_name, wf, wf)
        if AUTO_DELETE else """
bash -c 'set -euo pipefail;
if [ ! -f "%s" ]; then
    echo "Workflow file deleted: %s - ignoring.."
else
    echo "Updating workflow %s from file: %s"
    testkube create testworkflow --update -f "%s"
fi
'""" % (wf, wf, workflow_name, wf, wf))

        local_resource(
            apply_name,
            apply_cmd,
            deps=[wf],
            allow_parallel=True,
            labels=['update'],
        )

        # 2) Run: resolve the workflow name at runtime from the cluster (works for single or list)
        run_cmd = """
        bash -c 'set -euo pipefail;
echo "Running workflow %s on local runner: %s"
testkube run testworkflow "%s" --target name=%s -f --tag %s --variable HOST_NAME=%s %s
'""" % (workflow_name, RUNNER_AGENT_NAME, workflow_name, RUNNER_AGENT_NAME, EXECUTION_TAGS, HOST_NETWORK_ADDRESS, (RUN_SILENTLY and '--silent' or ''))

        run_name = res_id('Run Workflow %s' % workflow_name, service, wf)
        local_resource(
            run_name,
            run_cmd,
            trigger_mode=TRIGGER_MODE_AUTO if AUTO_RUN else TRIGGER_MODE_MANUAL,
            resource_deps=[apply_name],
            deps=[service_dir],
            allow_parallel=True,
            labels=['execute'],
            auto_init=False
        )

# =========================
# Add Admin Resource
# =========================
local_resource(
    'Testkube Runner Agent Status',
    'bash -lc "kubectl get nodes -o wide && kubectl -n %s get pods -o wide"' % AGENT_NAMESPACE,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
)

local_resource(
    'Testkube Status',
    'bash -lc "testkube status && testkube get context"',
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
)

local_resource(
    'Mount Tests into Minikube',
    serve_cmd='bash -lc "minikube mount ./:/minikube-host/testkube-local-dev"',
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['admin'],
)

# ==================================================
# Add Admin Buttons to Navigation Bar
# ==================================================

cmd_button(
    name='nav-testkube-dashboard',
    location=location.NAV,
    text='Testkube Dashboard',
    argv=['testkube', 'dashboard'],
    icon_name='home',
)

cmd_button(
    name='nav-testkube-docs',
    location=location.NAV,
    text='Testkube Docs',
    argv=['open', 'https://docs.testkube.io'],
    icon_name='help',
)


# ===========================================================================
# Create TestWorkflowTemplate for local dev override
# ==================================================

# Example helper function
def create_local_dev_override_workflow_template(resource_yaml):

    # Use mktemp to create a temporary file with cleanup
    cmd = """
    bash -c 'set -euo pipefail;
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
        auto_init=False
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

