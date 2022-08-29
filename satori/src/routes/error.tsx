import { Link } from "react-router-dom";
import { Container } from "reactstrap";

export function Error() {
    return <Container>
        <div className="text-center mt-5">
            <h1>You seem to have gotten lost...</h1>
            <p className="lead">Click <Link to="/">here</Link> to return to safety...</p>
        </div>
    </Container>
}