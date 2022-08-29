import { createRef } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Col, Row } from "reactstrap";

import { Controller } from "../controller";

export function ViewSurrogate() {
    return <Outlet />
}

interface MachineViewProps {
    controller: Controller;
}
export function MachineView(props: MachineViewProps) {
    const { vm } = useParams();
    const canvas = createRef<HTMLCanvasElement>();
    props.controller.setCanvas(canvas);
    props.controller.connect(vm);
    return <canvas ref={canvas} width="800" height="600"></canvas>
}