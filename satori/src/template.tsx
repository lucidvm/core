import { Component, PropsWithChildren, ReactNode } from "react";
import { Outlet, NavLink as RouterNavLink } from "react-router-dom";
import { Navbar, NavbarBrand, Nav, NavItem, NavLink, NavbarToggler, Collapse, NavbarText, Container } from "reactstrap";

function AppNavLink(props: PropsWithChildren<{
    to: string
}>) {
    return <NavItem>
        <RouterNavLink to={props.to} className={({ isActive }) => "nav-link"
            + (isActive ? " active" : "")}>{props.children}</RouterNavLink>
    </NavItem>
}

interface AppTemplateProps extends PropsWithChildren {
    tagline?: string;
}
interface AppTemplateState {
    navbarOpen: boolean;
}
export class AppTemplate extends Component<AppTemplateProps, AppTemplateState> {

    constructor(props: AppTemplateProps) {
        super(props);
        this.state = {
            navbarOpen: false
        };
    }

    render(): ReactNode {
        return <>
            <header>
            <Navbar container="fluid" expand="sm" fixed="top">
                <NavbarBrand>LucidVM</NavbarBrand>
                <NavbarToggler onClick={() => this.setState({ navbarOpen: !this.state.navbarOpen })} />
                <Collapse isOpen={this.state.navbarOpen} navbar>
                    <Nav className="me-auto" navbar>
                        <AppNavLink to="/">Home</AppNavLink>
                        <NavLink href="/flashback">Legacy Client</NavLink>
                    </Nav>
                    <NavbarText>{this.props.tagline}</NavbarText>
                </Collapse>
            </Navbar>
            </header>
            <Container className="main-content" container="fluid">
                <Outlet />
            </Container>
            <footer>
                <Navbar container="fluid" expand="sm" fixed="bottom">
                    <NavbarText>Client: satori 0.0.0-dev • Server: unknown</NavbarText>
                </Navbar>
            </footer>
        </>
    }

}