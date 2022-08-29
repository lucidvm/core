import "bootstrap/dist/css/bootstrap.css";
import "./main.css";

import ReactDOM from "react-dom/client";
import { Routes, Route, BrowserRouter } from "react-router-dom";

import { AppTemplate } from "./template";
import { Home, ViewSurrogate, MachineView, Error } from "./routes";
import { Controller } from "./controller";

const controller = new Controller();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<AppTemplate />}>
                <Route path="/" element={<Home />} />
                <Route path="view" element={<ViewSurrogate />}>
                    <Route path=":vm" element={<MachineView controller={controller} />}></Route>
                </Route>
            </Route>
            <Route path="*" element={<Error />} />
        </Routes>
    </BrowserRouter>
);