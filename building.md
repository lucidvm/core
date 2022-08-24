# Building LucidVM

## aeon, virtue, and flashback

**Requirements**:
- git
- node and npm (v16 preferred)
- yarn (`sudo npm install -g yarn`)

```sh
# clone (recursively!)
git clone --recurse-submodules --remote-submodules https://github.com/lucidvm/core.git
cd core
# install and build everything
yarn build-core
# run aeon
yarn run-gateway
```