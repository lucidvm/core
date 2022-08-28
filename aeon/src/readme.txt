auth        - authentication drivers and authorization stuff
commands    - chat command handling
controller  - room controllers (the interfaces between users and vms)
db          - typeorm entities and db init stuff
gateway     - http+websocket server, core event handlers and routing logic
manager     - various auxiliary classes mostly relevant to aeon as a
              standalone application
protocol    - protocol adapters used by controllers for vnc, etc
routes      - http routes for static assets, apis, etc