import logo from './logo.svg';
import React, { Component } from 'react';
import Web3 from 'web3';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Container, Row, Table, Modal, FloatingLabel, Form, Button, Card, Nav} from 'react-bootstrap';
import InstaFarm from './data/instafarm-abi.json'
import AddressToPool from './data/poolMapping.json'
import ERC20ABI from './data/erc20-abi.json'

class App extends Component {

    constructor(props) {
        super(props);
        this.state = {
            connectedAccount: "",
            connectedNetwork: "",
            supportedNetwork : "",
            pools : [],
            farmer : {},
            instafarmContract : null,
            isConnected: false,
            alertType : "",
            showModel : false,
            activePool : {},
            amountToStake : 0,
            amountError : "",
            needTokenApproval : false,
            approvalMessage : "",
            instaFarmAddress : "0x87C7921bf56E92906fC5009f36661A84e549b020",
            web3: null
        };
    }

    async componentWillMount() {
        await this.loadWeb3()
            await this.loadBlockchainData()
    }

    async loadWeb3() {
        if (window.ethereum) {
            window.web3 = new Web3(window.ethereum)
            this.setState({ web3: window.web3  })
            await window.ethereum.enable()
            let that = this
            window.ethereum.on('accountsChanged', async (accounts) => {
                await that.loadBlockchainData()
            })
        }
        else if (window.web3) {
            window.web3 = new Web3(window.web3.currentProvider)
            this.setState({ web3: window.web3  })
            let that = this
            window.web3.on('accountsChanged', async (accounts) => {
                await that.loadBlockchainData()
            })
        }
        else {
            window.alert('Non-Ethereum browser detected. You should consider trying MetaMask!')
        }
    }

    async loadBlockchainData() {
        if (this.state.web3 != null) {
            const accounts = await this.state.web3.eth.getAccounts()
            this.setState({ connectedAccount: accounts[0] })

           this.state.instafarmContract = new this.state.web3.eth.Contract(InstaFarm, this.state.instaFarmAddress)
           const pools = await this.state.instafarmContract.methods.getAllPools().call()

            let farmerPoolInfo = await Promise.all(pools.map( async (pool, PID) => {
                ++PID
                const totalStaked = await this.state.instafarmContract.methods.totalPoolStake(PID).call()
                const farmer =  await this.getCurrentFarmerInfo(PID)
                return {farmer :{amount : farmer.amount, rewardDue : farmer.rewardDue}, ID:PID, lpToken : pool.lpToken, rewardFactor : pool.rewardFactor, totalStaked : Web3.utils.fromWei(totalStaked)}
            }))

            this.setState({pools : farmerPoolInfo})
            console.log("pools >>!! >> ",  this.state.pools)
        }
    }

    getContractNameByAddress(address) {
        let symbol = ""
        Object.keys(AddressToPool).forEach(function(key) {
            if (address == key) {
                symbol = AddressToPool[key].symbol
            }
        });
        return symbol
    }

    async getCurrentFarmerInfo(PID) {
        const farmer = await this.state.instafarmContract.methods.getFarmerInfoPerPoolID(PID, this.state.connectedAccount).call()
        return farmer
    }

    async handleStakingValue(amountToStake) {
        // Get user token balance
        let tokenInstance = new this.state.web3.eth.Contract(ERC20ABI, this.state.activePool.lpToken)
        let tokenBal = await tokenInstance.methods.balanceOf(this.state.connectedAccount).call()
        let tokenDecimal = await tokenInstance.methods.decimals().call()
        let userTokenBal = tokenBal / (10**tokenDecimal)

        // Check user has sufficient balance
        if (userTokenBal < amountToStake) {
            this.setState({amountError : "Insufficient funds, please fund account to stake"})
            return
        }

        this.setState({amountError : "", amountToStake})
    }

    async handleUnStakingValue(amountToStake) {
        // Get user token balance
        let tokenBal = await this.state.instafarmContract.methods.getFarmerInfoPerPoolID(this.state.activePool.ID, this.state.connectedAccount).call()
        let userStakingBal = Web3.utils.fromWei(tokenBal.amount)
        // Check user has sufficient balance
        if (userStakingBal < amountToStake) {
            this.setState({amountError : "Insufficient funds, withdrawal amount is more than your stake"})
            return
        }

        this.setState({amountError : "", amountToStake})
    }

    toggleAlert(alertType,activePool) {
        if (!this.state.showModel) {
            this.setState({alertType, activePool})
        }
        this.setState({showModel : !this.state.showModel})
    }

    async gasPrice() {
        let result = await this.state.web3.eth.getGasPrice()
        return result
    }

    async gasLimit(from, to, data) {
        // let gasPrice = await this.gasPrice()
        // let data = this.state.web3.eth.abi.encodeFunctionCall("deposit", [this.state.activePool.ID, amountToStakeInWei])
        // let gasLimit = await this.gasLimit(this.state.connectedAccount, this.state.instafarmContract, data)

        let nonce =  await this.web3.eth.getTransactionCount(from)
        let gasLimit = await this.web3.eth.estimateGas({
            "from"      : from,
            "to"        : to,
            "nonce" : nonce,
            "data"      : data
        })
        return gasLimit
    }

    async stake() {
        let tokenInstance = new this.state.web3.eth.Contract(ERC20ABI, this.state.activePool.lpToken)
        let allowance = await tokenInstance.methods.allowance(this.state.connectedAccount, this.state.instaFarmAddress).call()
        let tokenDecimal = await tokenInstance.methods.decimals().call()
        let contractAllowance = allowance / (10**tokenDecimal)
        if (contractAllowance < this.state.amountToStake) {
            this.setState({needTokenApproval : true, approvalMessage : "Your approval is required for staking "})
            return
        }
        this.setState({needTokenApproval : false})

        // stake
        let amountToStakeInWei = Web3.utils.toWei(this.state.amountToStake.toString())

        let gasPrice = await this.gasPrice()
        await this.state.instafarmContract.methods.deposit(this.state.activePool.ID, amountToStakeInWei).send({from :this.state.connectedAccount, gasPrice})
        this.state.instafarmContract.events.PoolDeposit({})
            .on('data', async function(event){
                this.setState({needTokenApproval : false})
            })
            .on('error', () => {
                this.setState({approvalMessage : "Staking transaction failed, please try again!"})
            });
        this.toggleAlert()
    }

    async unStake() {
        // UnStake
        let amountToUnStakeInWei = Web3.utils.toWei(this.state.amountToStake.toString())

        await this.state.instafarmContract.methods.withdraw(this.state.activePool.ID, amountToUnStakeInWei).send({from :this.state.connectedAccount})
        this.state.instafarmContract.events.PoolWithdrawal({})
            .on('data', async function(event){
            })
            .on('error', () => {
                this.setState({approvalMessage : "UnStaking transaction failed, please try again!"})
            });
        this.toggleAlert()
    }

    async claim(activePool) {
        // Claim
        await this.state.instafarmContract.methods.claimReward(activePool.ID).send({from :this.state.connectedAccount})
        this.toggleAlert("claim", activePool.ID)
    }

    async approve() {
        let tokenInstance = new this.state.web3.eth.Contract(ERC20ABI, this.state.activePool.lpToken)
        let totalSupply = await tokenInstance.methods.totalSupply().call()
        await tokenInstance.methods.approve(this.state.instaFarmAddress, totalSupply).send({from: this.state.connectedAccount})
        tokenInstance.events.Approval({})
            .on('data', async function(event){
                this.setState({needTokenApproval : false})
            })
            .on('error', () => {
                this.setState({approvalMessage : "Approval transaction failed, please try again!"})
            });

        this.setState({needTokenApproval : false})
    }

    render () {
        var farmingPools = []

        this.state.pools.forEach(async (pool, index) => {
            farmingPools.push(<tr key={index}>
                <td>{ this.getContractNameByAddress(pool.lpToken)}</td>
                <td>{Web3.utils.fromWei(pool.farmer.amount)}</td>
                <td>{Web3.utils.fromWei(pool.farmer.rewardDue)}</td>
                <td>{ pool.rewardFactor}</td>
                <td>{ pool.totalStaked}</td>
                <td>
                    <Button onClick={() => this.toggleAlert("staking", pool)} className="ml-5" variant="primary">Stake</Button>
                    <Button onClick={() => this.toggleAlert("unstaking", pool)} className="mr-5" variant="warning">UnStake</Button>
                    <Button onClick={() => this.claim(pool)} className="ml-5" variant="success">Claim Reward</Button>
                </td>
            </tr>)
        })

        return (
            <Container fluid>
                <Modal show={this.state.showModel} >
                    <Modal.Header closeButton onClick={() => this.toggleAlert("")}>
                        {(this.state.alertType === "staking") && (<Modal.Title>Staking</Modal.Title>)}
                        {(this.state.alertType === "unstaking") && (<Modal.Title>UnStaking</Modal.Title>)}
                        {(this.state.alertType === "claim") && ( <Modal.Title>Claim Reward</Modal.Title>)}

                    </Modal.Header>
                    <Modal.Body>
                        {(this.state.alertType === "staking") &&
                        (<> { this.state.needTokenApproval ? <p className="text-warning"> {this.state.approvalMessage}</p> : <p> Please enter the amount you want to stake in this pool : {this.getContractNameByAddress(this.state.activePool.lpToken)}</p>}
                                <FloatingLabel controlId="floatingInput" label="Amount to stake" className="mb-3">
                                    <Form.Control type="email" placeholder="name@example.com" onChange={ async (event) => await this.handleStakingValue(event.target.value)} />
                                </FloatingLabel>
                            { this.state.amountError !== ""
                                ? <small className="text-danger">{this.state.amountError}</small>
                                : null
                            }
                        </>)

                        }
                        {(this.state.alertType === "unstaking") &&
                        (<> <p> Please enter the amount of stake you want to withdraw from this pool : {this.getContractNameByAddress(this.state.activePool.lpToken)}</p>
                            <FloatingLabel controlId="floatingInput" label="Enter amount to withdraw" className="mb-3">
                                <Form.Control type="text" placeholder="Enter amount to withdraw" onChange={ async (event) => await this.handleUnStakingValue(event.target.value)} />
                            </FloatingLabel>
                            { this.state.amountError !== ""
                                ? <small className="text-danger">{this.state.amountError}</small>
                                : null
                            }
                        </>)}

                        {(this.state.alertType === "claim") &&
                        (<h1>Reward sent successfully!</h1>)}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => this.toggleAlert("")}>Cancel</Button>
                        {(this.state.alertType === "staking") && (
                            <>
                            { this.state.needTokenApproval ? <Button variant="warning" onClick={async () => await this.approve()} >Approve</Button> :
                            <Button disabled={this.state.amountError !== ""} variant="primary" onClick={async () => await this.stake()} >Stake</Button>}
                            </>
                        )}
                        {(this.state.alertType === "unstaking") && (
                            <Button disabled={this.state.amountError !== ""} variant="danger" onClick={async () => await this.unStake()} >UnStake</Button>
                        )}
                    </Modal.Footer>
                </Modal>
                <Row>
                    <Card className="bg-gradient">
                        <Nav
                            activeKey="/home"
                            onSelect={(selectedKey) => alert(`selected ${selectedKey}`)}
                        >
                            <Nav.Item >
                                <Nav.Link href="/home">InstaFarm</Nav.Link>
                            </Nav.Item>
                            <Nav.Item >{
                                (this.state.connectedAccount !== "")?
                                    <Nav.Link >{this.state.connectedAccount}</Nav.Link> :
                                    <Nav.Link onClick={() => this.loadWeb3()} > "Connect Wallet" </Nav.Link> }

                            </Nav.Item>
                        </Nav>
                        <Card.Body>Welcome to InstaFarm staking / Farming Pool</Card.Body>
                    </Card>
                    <Table striped bordered hover>
                        <thead>
                        <tr>
                            <th>Pool</th>
                            <th>Amount Staked</th>
                            <th>Amount Earned</th>
                            <th>Reward Factor</th>
                            <th>Total Liquidity</th>
                            <th>Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                            {farmingPools}
                        </tbody>
                    </Table>
                </Row>
            </Container>
        )
    }
}

export default App;
