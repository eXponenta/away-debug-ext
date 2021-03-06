import "react-virtualized/styles.css";
import styled from "styled-components";

import React, { Component, Fragment, createRef } from "react";
import { RolledIcon, Icon, Section, Blink } from "./elements/SectionItems.jsx";
import { Button } from "./elements/Button.jsx";
import { Logger } from "./Tabs/Logger.jsx";
import { Main } from "./Tabs/Main.jsx";
import { NodeTree } from "./Tabs/NodeTree.tsx";


const CONNECTION_STATUS = {
	OFFLINE: "offline",
	ONLINE: "online",
	CONNECTION: "connection",
};

const ATTEMTS = 10;
const _TABS = [
	{
		tab: Main,
		name: "Info",
		icon: undefined,
	},
	/*{
		tab: Logger,
		name: "Logger",
		icon: undefined,
	},*/
	{
		tab: NodeTree,
		name: "Tree",
		icon: undefined,
	},
	/*
	{
		tab: () => <div>Settings</div>,
		name: "Settings",
		icon: "settings",
		align: "right",
	},*/
];

const Logo = styled.div`
	background-image: url("./gfx/icon128.png");
	background-size: contain;
	width: 36px;
	height: 36px;
	margin: 0 0.5em;
`;

const ErrorBox = styled.div`
	position: absolute;
	width: 100vw;
	min-height: 3em;
	padding: 0em 1em;
	background: #ff6347;
	border: 1px solid #ff4500;
	color: white;
	top: -100%;
	opacity: 0;
	z-index: 100;
	transition: top 0.5s, opacity 0.5s;

	&.active {
		top: 0%;
		opacity: 1;
	}
`;

const Close = styled(Icon)`
	position: absolute;
	right: 0.5em;
	top: 0.5em;
	cursor: pointer;
	user-select: none;

	&:hover {
		color: #222;
	}

	&:focus {
		transform: scale(0.8);
	}
`;

export const Error = ({ title, message, onClose }) => {
	return (
		<ErrorBox className={!!message && "active"}>
			<Close onClick={onClose}>clear</Close>
			<h3>{ title ? title.toString() : ""}</h3>
			<p>{ message ?  message.toString() : ""}</p>
		</ErrorBox>
	);
};

export class Panel extends Component {
	constructor(props) {
		super(props);

		const currentTab = localStorage.getItem('currentTab') || _TABS[0].name;

		this.state = {
			currentTab,
			connection: CONNECTION_STATUS.OFFLINE,
			attemts: 0,
			error: '',
			playState: 'play'
		};

		/**
		 * @type {IDevToolAPI}
		 */
		this._devApi = undefined;
		this.activeTab = createRef();
		this._reconectionTimeout = undefined;

		window.PANEL_API = {
			init: this.onInit.bind(this),
			detach: this.onDetach.bind(this),
			emit: this.onEmit.bind(this),
		};

		window.addEventListener('keydown', this.onKeyDown.bind(this));
	}

	/**
	 * emited from provider
	 * @param {string} type
	 */
	onEmit(type, data) {
		const tab = this.activeTab.current;
		tab.onEmit && tab.onEmit(type, data);
	}

	/**
	 *
	 * @param {IDevToolAPI} devApi
	 */
	onInit(devApi) {
		this._devApi = devApi;

		const oldCall = devApi.directCall;

		devApi.directCall = (...args) => {
			return oldCall(...args)
				.then((e) => {
					console.log('direct call result:', e)
					return e;
				})
				.catch((error) => {
					this.fireError(error)
					throw error;
				});
		};

		const tab = this.activeTab.current;
		tab.onInit && tab.onInit(this._devApi);

		this._runReconnection();
	}

	fireError(message) {
		this.setState({
			error: message,
		});

		console.error("ERROR", message);
	}

	// emited from dev provider
	onDetach(reconnect = true) {
		const tab = this.activeTab.current;

		tab.onDetach && tab.onDetach(reconnect);

		this.setState({
			connection: CONNECTION_STATUS.OFFLINE,
			attemts: 0,
		});

		this._stopConnection();

		setTimeout(() => {
			this._runReconnection();
		}, 1000);
	}

	onConnectingDone() {
		const tab = this.activeTab.current;

		tab.onAttach && tab.onAttach();

		this.setState({
			connection: CONNECTION_STATUS.ONLINE,
			attemts: 0,
			error: undefined
		});

		this._devApi.directCall('getRAFState').then((state) =>{
			this.setState({
				playState: state
			});
		});
	}

	switchTab(currentTab) {
		this.setState({
			currentTab,
		});

		localStorage.setItem("currentTab", currentTab);
	}

	onReconnect() {
		console.debug("Force reconnect");
		this._runReconnection();
	}

	onCloseError() {
		this.setState({
			error: undefined,
		});
	}

	/**
	 * 
	 * @param {KeyboardEvent} event 
	 */
	onKeyDown(event) {
		if(event.code === 'Space') {
			return this.setStopPlayState();
		}

		if(event.code === 'ArrowRight') {
			return this.setNextPlaySate();
		}
	}

	setStopPlayState() {
		if(this.state.playState == 'stop') {
			this.setRafState('play');
			return;
		}
		
		this.setRafState('stop');
	}

	setNextPlaySate() {
		if(this.state.playState !== 'stop')
			return;

		this.setRafState('next');
	}

	setRafState(state = 'play') {
		if (
			!this._devApi ||
			this.state.connection !== CONNECTION_STATUS.ONLINE
		) {
			return;
		}

		this._devApi.directCall('setRAFState', [state]).then((result)=>{
			console.log(result);

			this.setState({
				playState: result
			});
		});
	}

	_stopConnection() {
		clearTimeout(this._reconectionTimeout);
	}

	_runReconnection() {
		if (
			!this._devApi ||
			this.state.connection === CONNECTION_STATUS.ONLINE
		) {
			return;
		}

		console.debug("Reconnection runned");

		this._stopConnection();

		const attemts = this.state.attemts;

		if (attemts >= ATTEMTS) {
			this.setState({
				attemts: 0,
				connection: CONNECTION_STATUS.OFFLINE,
			});
			return;
		}

		this.setState({
			connection: CONNECTION_STATUS.CONNECTION,
			attemts: attemts + 1,
		});

		this._devApi
			.tryConnect()
			.catch(() => {
				return false;
			})
			.then((status) => {
				this._stopConnection();

				if (status) {
					this.onConnectingDone();
				} else {
					this._reconectionTimeout = setTimeout(() => {
						this._runReconnection();
					}, attemts * 300);
				}
			});
	}

	render() {
		const buttons = [];
		const tabs = [];

		const lastActiveTab = this.activeTab.current;
		const locked = this.state.connection !== CONNECTION_STATUS.ONLINE;

		_TABS.forEach(({ tab: Tab, icon, name, align }) => {
			const active = this.state.currentTab === name;
			const className = `${active ? "active" : ""} ${ icon ? ('tiny ' + align) : ""}`;

			tabs.push(
				<Section active={active} locked={locked} key={name}>
					<Tab
						locked = {locked}
						devApi = {this._devApi}
						ref = {active ? this.activeTab : undefined}
						active = {active}
						panel = {this}
					/>
				</Section>
			);

			buttons.push(
				<Button
					key={name}
					onClick={() => this.switchTab(name)}
					className={ className }
				>
					{ icon ? (<Icon>{icon}</Icon>) : name }
				</Button>
			);
		});
		let Status;

		switch (this.state.connection) {
			case CONNECTION_STATUS.ONLINE: {
				Status = <Button className="green">ONLINE</Button>;
				break;
			}
			case CONNECTION_STATUS.CONNECTION: {
				Status = (
					<Button className="green">
						<span>CONNECTION</span>
						<RolledIcon>cached</RolledIcon>
					</Button>
				);
				break;
			}
			default: {
				Status = (
					<Button onClick={() => this.onReconnect()} className="red">
						<span>OFFLINE</span>
						<Icon>cached</Icon>
					</Button>
				);
			}
		}

		const error = typeof this.state.error === 'string' 
			? this.state.error 
			: JSON.stringify(this.state.error);

		return (
			<Fragment>
				<Error
					message={ error }
					title="ERROR"
					onClose={() => this.onCloseError()}
				/>
				<nav className="main">
					<div className="nav-wrap">
						<Logo />
						{buttons}
						<Button className = {`tiny right ${locked ? 'locked' : ''}`} onClick = {
							() => this.setStopPlayState()
						}>
							<Blink className = {this.state.playState === 'stop' ? 'blink' : ''}>
								pause_circle_filled
							</Blink>
						</Button>
						<Button className = {`tiny ${locked ? 'locked' : ''}`} onClick = {
							() => this.setNextPlaySate()
						}>
							<Icon>skip_next</Icon>
						</Button>						
					</div>
					{Status}
				</nav>
				{tabs}
			</Fragment>
		);
	}
}
