# Building LucidVM

## aeon

**Requirements**:
- git
- node and npm
- yarn (`sudo npm install -g yarn`)

```sh
# clone (recursively!)
git clone --recurse-submodules --remote-submodules https://github.com/lucidvm/core.git
cd core
# install and build everything
yarn build-all
```