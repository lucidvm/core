import { getCookie, setCookie } from "./util";

export function extendedInit(guac, tunnel) {
    guac.onauth_advertise = (mandate, strategies) => {
        console.debug("mandatory auth", mandate);
        console.debug("auth strategies", strategies);
    };
    guac.onauth_use = (strategy, data) => {
        console.debug("auth use", strategy, data);
    };
    guac.onauth_identify = () => {
        console.debug("auth successful");
    };
    guac.onauth_session = (token) => {
        console.debug("got token", token);
        setCookie("token", token, 0);
    };
    guac.onauth_reject = () => {
        console.debug("auth failed");
    };
    guac.onauth_stale = () => {
        console.debug("stale token, requesting strategies anew");
        tunnel.sendMessage("auth", 0);
    };
}

export function extendedSetup(tunnel) {
    // if server supports lucid-1 or greater
    if (tunnel.level >= 1) {
        const token = getCookie("token");
        if (token != null) {
            // send session token if we have it
            tunnel.sendMessage("auth", 3, token);
        }
        else {
            // else, request supported auth strategies
            tunnel.sendMessage("auth", 0);
        }
    }

    // set nick
    window.username = getCookie("nickname");
    if (username != null) {
        tunnel.sendMessage("rename", username);
    }
    else {
        tunnel.sendMessage("rename");
    }

    // connect to vm or request list
    if (window.vmName != null) {
        tunnel.sendMessage("connect", vmName);
    } else {
        tunnel.sendMessage("list");
    }
}

$(() => {
    const taglines = [
        "Anniversary Edition",
        "¿Donde mi los huevos?"
    ];
    $("#lucid-tagline").text(taglines[Math.floor(Math.random() * taglines.length)]);
});