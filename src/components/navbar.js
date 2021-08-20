import React, { Component } from 'react';
import {Card, Nav} from 'react-bootstrap';

class Navbar extends Component {

    render() {
        return (
            <Card className="bg-gradient">
                <Nav
                    activeKey="/home"
                    onSelect={(selectedKey) => alert(`selected ${selectedKey}`)}
                >
                    <Nav.Item >
                        <Nav.Link href="/home">InstaFarm</Nav.Link>
                    </Nav.Item>
                    <Nav.Item >
                        <Nav.Link >
                            {(this.props.connectedAccount !== "")? this.props.connectedAccount : "Connect Wallet" }
                        </Nav.Link>
                    </Nav.Item>
                </Nav>
                <Card.Body>Welcome to InstaFarm staking / Farming Pool</Card.Body>
            </Card>
        );
    }
}
export default Navbar;