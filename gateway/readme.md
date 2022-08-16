# LucidVM Gateway

- **src/auth**: authentication driver interfaces and implementations

- **src/controller**: "channel controller" abstractions at varying degrees of specificity, with the highest currently implemented being the `RemoteController` (which interfaces with a remote VM monitor instance)

- **src/core**: the actual server, core message plumbing, layer 5 stuff

- **src/db**: database wrapper; also implements an `AuthDriver` for the `local` authentication strategy

- **src/protocol**: vm->gateway tunnel protocol adapters