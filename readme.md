# LucidVM

An alternate backend server compatible with CollabVM 1.2, with optional protocol-level enhancements (including a denser MsgPack-based encoder for events and more).

This is a revisiting, roughly five years later, of a similar ill-fated project called LunaVM.

The core gateway server, `aeon`, is licensed under AGPLv3. All other code is licensed under 3-clause BSD unless otherwise stated.

This software is currently **pre-alpha**, and at this stage, **I will not assist in using it**. Please wait until a more mature release!


## Components

### Applications

- **aeon**: The actual server, written in TypeScript. Handles communication with clients, the "game logic" of CollabVM, event routing, transcoding VNC to Guac, etc. Able to use a remote monitor (such as `vixen`), or the `virtue` monitor in-process.

- **virtue**: Monitor implementation for QEMU/KVM.

- **[vixen](https://github.com/lucidvm/vixen)**: Monitor implementation for VMware hypervisors.

- **[hurl](https://github.com/lucidvm/hurl)**: Streams VM audio over WebSockets.

- **[flashback](https://github.com/lucidvm/flashback)**: Fork of the archaic collab-vm-web-app with hacked-in support for LucidVM extensions. For the time being (since we're already building atop the CollabVM 1.2 protocol anyway), this is the "reference client".

- **satori**: Next generation web client (currently in extremely early development).

### Libraries

- **[shared](https://github.com/lucidvm/shared)**: Code shared between other components of the project (such as event conduit abstractions and LEC codebooks).

- client: CollabVM client library geared towards LucidVM.

- **[rfb](https://github.com/lucidvm/rfb)**: A fork of [vnc-rfb-client](https://github.com/filipecbmoc/vnc-rfb-client) with a few changes for LucidVM.