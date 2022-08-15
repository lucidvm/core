# LucidVM Gateway Server

- **auth**: authentication driver interfaces and implementations

- **controller**: "channel controller" abstractions at varying degrees of specificity, with the highest currently implemented being the `RemoteController` (which interfaces with a remote VM monitor instance)

- **core**: the actual server, core message plumbing, layer 5 stuff

- **db**: database wrapper; also implements an `AuthDriver` for the `local` authentication strategy