## Prerequisites

Can be automated/scripted for the sake of easiness (ansible / mise / etc)

* docker + minikube (kind, k3s, or whatever we prefer)
* tilt.dev (A toolkit for fixing the pains of microservice development.)
* helm
* (kubectl & or testkube cli)

Steps can be checked + automated within tilt or yml

* install runner / superagent / oss agent / CP / docker agent / etc into the local cluster and potentially conenct to a CP
* mount local folder as volume into cluster
* conditional in workflow yamls to mount local mount vs github content, etc
* ENV vars to define runner-id, license-key, potential host overrides etc etc

## Local dev-loop

### Start
Starts and listens for changes

`tilt up`

### Cleanup
Stops clusters, etc

`tilt down`

### Reset/Destroy
Removes everything

`tilt destroy`


## Meaning for TK

Document + share best practices and rather improve what we have today - e.g. mute executions, etc etc
