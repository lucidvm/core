# LucidVM

An alternate backend server compatible with CollabVM 1.2, with optional protocol-level enhancements (including a denser MsgPack-based encoder for events and more).

This is a revisiting, roughly five years later, of a similar ill-fated project called LunaVM.

All code is licensed under 3-clause BSD unless otherwise stated.

This software is currently **pre-alpha**, and at this stage, **I will not assist in using it**. Please wait until a more mature release!


## Components

### Applications

- **aeon**: The actual server, written in TypeScript. Handles communication with clients, the "game logic" of CollabVM, event routing, transcoding VNC to Guac, etc. Requires a monitor to do anything useful.

- **[vixen](https://github.com/lucidvm/vixen)**: Monitor implementation for VMware hypervisors.

- **[flashback](https://github.com/lucidvm/flashback)**: Fork of the archaic collab-vm-web-app with hacked-in support for LucidVM extensions. For the time being (since we're already building atop the CollabVM 1.2 protocol anyway), this is the "reference client".

- **satori**: Next generation web client (currently in planning phase, will be based on the `@lucidvm/client` library).

### Libraries

- **[shared](https://github.com/lucidvm/shared)**: Code shared between other components of the project (such as event conduit abstractions and LEC codebooks).

- **[client](https://github.com/lucidvm/client)**: CollabVM client library geared towards LucidVM.

### Other

- **docs**: Protocol documentation of LucidVM, CollabVM, and the subset of the Guacamole relevant to implementing monitors, clients, and servers compatible with LucidVM (and, if you are so inclined, vanilla CollabVM 1.2).