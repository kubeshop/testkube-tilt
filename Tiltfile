# =========================
# Config
# =========================
NS = 'testkube'                     # namespace where Testkube agent runs
KUBE_CONTEXT_REQUIRED = 'minikube'  # your local k8s context
AUTO_RUN = True                     # False -> manual run buttons only
WORKFLOW_DIR = 'workflows'          # where workflow yamls live
SERVICE_ROOT = 'services'           # code folders that should trigger runs

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
    return '%s:%s:%s' % (prefix, service, sanitize_id(wf_path))


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
        deps = [wf, service_dir]

        # 1) Apply whenever deps change
        apply_name = res_id('apply', service, wf)
        local_resource(
            apply_name,
            'bash -lc "set -euo pipefail; kubectl apply -n testkube -f %s"' % wf,
            deps=deps,
            resource_deps=['preflight'],
        )

        # 2) Run: resolve the workflow name at runtime from the cluster (works for single or list)
        run_cmd = """
bash -lc 'set -euo pipefail;
name=$(kubectl get -f %s -n %s -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)
if [ -z "$name" ]; then
  name=$(kubectl get -f %s -n %s -o jsonpath="{.metadata.name}" 2>/dev/null || true)
fi
if [ -z "$name" ]; then
  echo "Could not determine TestWorkflow name from %s" >&2
  exit 1
fi
echo "Running workflow: $name"
testkube run testworkflow "$name" -n %s -f
'""" % (wf, NS, wf, NS, wf, NS)

        run_name = res_id('run', service, wf)
        local_resource(
            run_name,
            run_cmd,
            trigger_mode=TRIGGER_MODE_AUTO if AUTO_RUN else TRIGGER_MODE_MANUAL,
            resource_deps=[apply_name],
            allow_parallel=True,
        )

# =========================
# Global buttons
# =========================
local_resource(
    'status',
    'bash -lc "kubectl get nodes -o wide && kubectl -n %s get pods -o wide"' % NS,
    trigger_mode=TRIGGER_MODE_MANUAL,
    resource_deps=['preflight'],
)

local_resource(
    'dashboard',
    'bash -lc "testkube dashboard -n %s"' % NS,
    trigger_mode=TRIGGER_MODE_MANUAL,
    resource_deps=['preflight'],
)
