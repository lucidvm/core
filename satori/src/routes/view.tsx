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
    return <Row>
        <Col>
            <canvas ref={canvas} width="1024" height="768"></canvas>
        </Col>
        <Col>
            <h1>{vm}</h1>
        </Col>
    </Row>
}