import EventEmitter from 'node:events';

export default class Analyzer extends EventEmitter {
    #data
    #options
    #analysisPromise

    constructor(data, options) {
        super({ captureRejections: true });

        this.#data = data
        this.#options = options
    }

    get options() {
        return this.#options;
    }

    get data() {
        return this.#data;
    }

    analyze() {
        this.#analysisPromise = new Promise((resolve, reject) => {
            const data = this.#data;

            data.setVar('AnalysisStartTime', Date.now())

            data.setVar('ServerName', '')
            data.setVar('ServerVersion', '')
            data.setVar('ServerCPU', '')
            data.setVar('ServerVersionMajor', '')
            data.setVar('ServerOS', '')

            data.setVar('MaxQueue', 0)

            data.setVar('UniqueClientNetSpeedValues', new Set())
            data.setVar('ServerLiveTime', 0)
            data.setVar('ServerSeedingTime', 0)

            data.setVar('CalculateLiveTime', this.calcSeedingLiveTime)

            data.setVar('explosionCountersPerController', [])
            data.setVar('serverMoveTimestampExpiredPerController', [])
            data.setVar('pawnsToPlayerNames', [])
            data.setVar('pawnToSteamID', [])
            data.setVar('chainIdToPlayerController', [])
            data.setVar('playerNameToPlayerController', [])
            data.setVar('playerControllerToPlayerName', [])
            data.setVar('playerControllerToSteamID', [])
            data.setVar('steamIDToPlayerController', new Map())
            data.setVar('killsPerPlayerController', [])
            data.setVar('connectionTimesByPlayerController', [])
            data.setVar('disconnectionTimesByPlayerController', [])
            data.setVar('playerControllerToNetspeed', [])
            data.setVar('fobHitsPerController', [])

            this.on("line", (line) => {
                let regex, res;

                regex = /\[(.+)\]\[[\s\d]+\]LogSquad: .+: Server Tick Rate: (\d+.?\d+)/;
                res = regex.exec(line);
                if (res) {
                    const timePoint = this.getDateTime(res[ 1 ]);
                    data.addTimePoint(timePoint);

                    data.setNewCounterValue('tickRate', Math.round(+res[ 2 ]))
                    return;
                }

                regex = / ServerName: \'(.+)\' RegisterTimeout:/
                res = regex.exec(line);
                if (res) {
                    data.setVar('ServerName', res[ 1 ]);
                    return;
                }

                regex = /LogInit: OS: .+, CPU: (.+), GPU:/
                res = regex.exec(line);
                if (res) {
                    data.setVar('ServerCPU', res[ 1 ]);
                    return;
                }

                regex = /LogNetVersion: Set ProjectVersion to (V.+)\. Version/
                res = regex.exec(line);
                if (res) {
                    let serverVersion = res[ 1 ];
                    data.setVar('ServerVersion', serverVersion)
                    data.setVar('ServerVersionMajor', +serverVersion.substring(1, 2))
                    return;
                }

                regex = /NotifyAcceptingChannel/;
                res = regex.exec(line);
                if (res) {
                    const val = data.incrementCounter('queue', 1).y;
                    const maxQueue = data.getVar('MaxQueue')
                    if (val > maxQueue) data.setVar('MaxQueue', val)
                }
                regex = /AUTH HANDLER: Sending auth result to user .+ with flag success\? 0/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('queueDisconnections', 3);
                    return;
                }
                regex = /LogOnline: Warning: STEAM: AUTH: Ticket from user .+ is empty/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('steamEmptyTicket', 1)
                    return;
                }

                regex = /CloseBunch/
                res = regex.exec(line);
                if (res) {
                    data.incrementCounter('queue', -1)
                }

                regex = /LogSquad: PostLogin: NewPlayer:/;
                res = regex.exec(line);
                if (res) {
                    data.getVar('CalculateLiveTime')(data)
                    data.incrementCounter('players', 1);
                }

                regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == [0-9]+\. Name: \[UChannel\] ChIndex: [0-9]+, Closing: [0-9]+ \[UNetConnection\] RemoteAddr: (.+):[0-9]+, Name: (Steam|EOSIp)NetConnection_[0-9]+, Driver: GameNetDriver (Steam|EOS)NetDriver_[0-9]+, IsServer: YES, PC: ([^ ]+PlayerController_C_[0-9]+), Owner: [^ ]+PlayerController_C_[0-9]+/
                res = regex.exec(line);
                if (res) {
                    data.getVar('CalculateLiveTime')(data)
                    data.incrementCounter('players', -1);
                    const disconnectionTimesByPlayerController = data.getVar('disconnectionTimesByPlayerController')
                    disconnectionTimesByPlayerController[ res[ 6 ] ] = this.getDateTime(res[ 1 ])
                    return;
                }

                regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('hostClosedConnection', 3)
                    return;
                }

                regex = /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/;
                res = regex.exec(line);
                if (res) {
                    const timePoint = this.getDateTime(res[ 1 ]);
                    data.setNewCounterValue('layers', 150, res[ 2 ], timePoint)
                    return;
                }

                regex = /\[(.+)\]\[[\s\d]+].*LogWorld: SeamlessTravel to: .+\/([^\/]+)$/;
                res = regex.exec(line);
                if (res) {
                    data.setNewCounterValue('layers', 150, res[ 2 ])
                    return;
                }

                regex = /ApplyExplosiveDamage\(\).*DamageInstigator=([^ ]+PlayerController_C_\d+) /;
                res = regex.exec(line);
                if (res) {
                    const playerController = res[ 1 ];

                    if (this.options.PLAYER_CONTROLLER_FILTER == "" || this.options.PLAYER_CONTROLLER_FILTER == playerController)
                        data.incrementFrequencyCounter('frags', 1)

                    const explosionCountersPerController = data.getVar('explosionCountersPerController')
                    if (!explosionCountersPerController[ playerController ]) explosionCountersPerController[ playerController ] = 0;
                    explosionCountersPerController[ playerController ]++;
                    return;
                }

                regex = /ServerMove\: TimeStamp expired: ([\d\.]+), CurrentTimeStamp: ([\d\.]+), Character: (.+)/;
                res = regex.exec(line);
                if (res) {
                    const timestampExpired = +res[ 1 ];
                    const currentTimeStamp = +res[ 2 ];
                    const delta = currentTimeStamp - timestampExpired
                    const playerName = data.getVar('pawnsToPlayerNames')[ res[ 3 ] ];
                    const pawnToSteamID = data.getVar('pawnToSteamID')
                    const steamID = pawnToSteamID[ res[ 3 ] ];
                    const steamIDToPlayerController = data.getVar('steamIDToPlayerController')
                    const playerControllerHistory = steamIDToPlayerController.get(steamID);
                    const lastPlayerController = [ ...playerControllerHistory ].pop();
                    const playerNameToPlayerController = data.getVar('playerNameToPlayerController')
                    const playerController = steamID ? lastPlayerController : playerNameToPlayerController[ playerName ]

                    let unidentifiedPawns = data.getVar('UnidentifiedPawns');
                    if (!unidentifiedPawns) {
                        data.setVar('UnidentifiedPawns', new Set())
                        unidentifiedPawns = data.getVar('UnidentifiedPawns');
                    }

                    if (!playerController)
                        unidentifiedPawns.add(`${res[ 3 ]} - ${playerName} - ${steamID} - ${playerController}`)

                    if (this.options.PLAYER_CONTROLLER_FILTER == "" || this.options.PLAYER_CONTROLLER_FILTER == playerController)
                        data.incrementFrequencyCounter('serverMove', 0.05)

                    const serverMoveTimestampExpiredPerController = data.getVar('serverMoveTimestampExpiredPerController')
                    if (delta > 150 || !this.options.ENABLE_TSEXPIRED_DELTA_CHECK) {
                        if (!serverMoveTimestampExpiredPerController[ playerController ]) {
                            serverMoveTimestampExpiredPerController[ playerController ] = 0;
                        }
                        serverMoveTimestampExpiredPerController[ playerController ]++;
                    }
                    return;
                }

                regex = /Warning: UNetConnection::Tick/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('unetConnectionTick', 1)
                    return;
                }

                regex = /SetReplicates called on non-initialized actor/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('nonInitializedActor', 1)
                    return;
                }

                regex = /RotorWashEffectListener/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('rotorWashEffectListener', 1)
                    return;
                }

                regex = /\[(.+)\]\[([\s\d]+)\].+Client netspeed is (\d+)/;
                res = regex.exec(line);
                if (res) {
                    data.setNewCounterValue('clientNetSpeed', (+res[ 3 ]) / 1000)
                    data.getVar('UniqueClientNetSpeedValues').add(+res[ 3 ]);
                    const playerControllerToNetspeed = data.getVar('playerControllerToNetspeed')
                    const chainIdToPlayerController = data.getVar('chainIdToPlayerController')
                    const playerController = chainIdToPlayerController[ +res[ 2 ] ]
                    if (playerController) {
                        if (!playerControllerToNetspeed[ playerController ]) playerControllerToNetspeed[ playerController ] = []
                        playerControllerToNetspeed[ playerController ].push(+res[ 3 ])
                    }
                    return;
                }

                if (data.getVar('ServerVersionMajor') < 7) {
                    regex = /OnPossess\(\): PC=(.+) Pawn=(.+) FullPath/;
                    res = regex.exec(line);
                    if (res) {
                        const pawnsToPlayerNames = data.getVar('pawnsToPlayerNames')
                        pawnsToPlayerNames[ res[ 2 ] ] = res[ 1 ];
                        const playerNameToPlayerController = data.getVar('playerNameToPlayerController')
                        const playerController = playerNameToPlayerController[ res[ 1 ] ];
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID')
                        const steamID = playerControllerToSteamID[ playerController ];
                        const pawnToSteamID = data.getVar('pawnToSteamID')
                        pawnToSteamID[ res[ 2 ] ] = steamID;
                    }

                    regex = /\[(.+)\]\[([\s\d]+)\]LogSquad: PostLogin: NewPlayer: [^ ]+PlayerController_C.+PersistentLevel\.(.+)/;
                    res = regex.exec(line);
                    if (res) {
                        const chainIdToPlayerController = data.getVar('chainIdToPlayerController')
                        const connectionTimesByPlayerController = data.getVar('connectionTimesByPlayerController')
                        chainIdToPlayerController[ +res[ 2 ] ] = res[ 3 ];
                        connectionTimesByPlayerController[ res[ 3 ] ] = this.getDateTime(res[ 1 ])
                    }

                    regex = /Die\(\): Player:.+from (.+) caused by (.+)/;
                    res = regex.exec(line);
                    if (res) {
                        let playerController = res[ 1 ]
                        if (!playerController || playerController == 'nullptr') {
                            const playerNameToPlayerController = data.getVar('playerNameToPlayerController')
                            playerController = playerNameToPlayerController[ pawnsToPlayerNames[ res[ 2 ] ] ]
                        }

                        if (this.options.PLAYER_CONTROLLER_FILTER == "" || this.options.PLAYER_CONTROLLER_FILTER == playerController)
                            data.incrementFrequencyCounter('PlayerKills', 1 / 5)

                        const killsPerPlayerController = data.getVar('killsPerPlayerController')
                        if (!killsPerPlayerController[ playerController ]) killsPerPlayerController[ playerController ] = 0;
                        killsPerPlayerController[ playerController ]++;
                        return;
                    }
                } else {
                    regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquad: PostLogin: NewPlayer: BP_PlayerController_C .+PersistentLevel\.(.+) \(IP: ([\d\.]+) \| Online IDs: EOS: (.+) steam: (\d+)\)/;
                    res = regex.exec(line);
                    if (res) {
                        const playerController = res[ 3 ];

                        const chainIdToPlayerController = data.getVar('chainIdToPlayerController')
                        const connectionTimesByPlayerController = data.getVar('connectionTimesByPlayerController')
                        chainIdToPlayerController[ +res[ 2 ] ] = playerController;
                        connectionTimesByPlayerController[ res[ 3 ] ] = this.getDateTime(res[ 1 ])

                        const steamID = res[ 6 ];
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID')
                        playerControllerToSteamID[ playerController ] = steamID;

                        const steamIDToPlayerController = data.getVar('steamIDToPlayerController')
                        const playerControllerHistory = steamIDToPlayerController.get(steamID);
                        if (!playerControllerHistory)
                            steamIDToPlayerController.set(steamID, [ playerController ]);
                        else
                            playerControllerHistory.push(playerController)
                    }

                    regex = /OnPossess\(\): PC=(.+) \(Online IDs: EOS: (.+) steam: (\d+)\) Pawn=(.+) FullPath/;
                    res = regex.exec(line);
                    if (res) {
                        const pawnToSteamID = data.getVar('pawnToSteamID')
                        pawnToSteamID[ res[ 4 ] ] = res[ 3 ];
                        data.getVar('pawnsToPlayerNames')[ res[ 4 ] ] = res[ 1 ];
                    }

                    regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquadTrace: \[DedicatedServer](?:ASQSoldier::)?Die\(\): Player:(.+) KillingDamage=(?:-)*([0-9.]+) from ([A-z_0-9]+) \(Online IDs: EOS: ([\w\d]{32}) steam: (\d{17}) \| Contoller ID: ([\w\d]+)\) caused by ([A-z_0-9-]+)_C/;
                    res = regex.exec(line);
                    if (res) {
                        let playerController = res[ 5 ]

                        if (this.options.PLAYER_CONTROLLER_FILTER == "" || this.options.PLAYER_CONTROLLER_FILTER == playerController)
                            data.incrementFrequencyCounter('PlayerKills', 1 / 5)

                        const killsPerPlayerController = data.getVar('killsPerPlayerController')
                        if (!killsPerPlayerController[ playerController ]) killsPerPlayerController[ playerController ] = 0;
                        killsPerPlayerController[ playerController ]++;
                        return;
                    }
                }

                // regex = /\[.+\]\[([\s\d]+)\]LogSquad: Player (.+) has been added to Team/;
                // res = regex.exec(line);
                // if (res) {
                //     playerNameToPlayerController[ res[ 2 ] ] = chainIdToPlayerController[ +res[ 1 ] ];
                //     playerControllerToPlayerName[ chainIdToPlayerController[ +res[ 1 ] ] ] = res[ 2 ];
                //     return;
                // }
                regex = /\[(.+)\]\[([\s\d]+)\]LogNet: Join succeeded: (.+)/;
                res = regex.exec(line);
                if (res) {
                    const playerNameToPlayerController = data.getVar('playerNameToPlayerController')
                    const chainIdToPlayerController = data.getVar('chainIdToPlayerController')
                    const playerControllerToPlayerName = data.getVar('playerControllerToPlayerName')
                    playerNameToPlayerController[ res[ 3 ] ] = chainIdToPlayerController[ +res[ 2 ] ];
                    playerControllerToPlayerName[ chainIdToPlayerController[ +res[ 2 ] ] ] = res[ 3 ];
                    delete chainIdToPlayerController[ +res[ 2 ] ];
                    return;
                }

                regex = /\[.+\]\[([\s\d]+)\]LogEOS: \[Category: LogEOSAntiCheat\] \[AntiCheatServer\] \[RegisterClient-001\].+AccountId: (\d+) IpAddress/;
                res = regex.exec(line);
                if (res) {
                    const chainIdToPlayerController = data.getVar('chainIdToPlayerController')
                    const playerController = chainIdToPlayerController[ +res[ 1 ] ];

                    if (playerController) {
                        const steamID = res[ 2 ];
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID')
                        playerControllerToSteamID[ playerController ] = steamID;

                        const steamIDToPlayerController = data.getVar('steamIDToPlayerController')
                        const playerControllerHistory = steamIDToPlayerController.get(steamID);
                        if (!playerControllerHistory)
                            steamIDToPlayerController.set(steamID, [ playerController ]);
                        else if (!playerControllerHistory.includes(playerController))
                            playerControllerHistory.push(playerController)
                    }
                    return;
                }

                regex = /TakeDamage\(\): BP_FOBRadio_Woodland_C.+Online IDs: EOS: ([\w\d]{32}) steam: (\d{17})\)/;
                res = regex.exec(line);
                if (res) {
                    const fobHitsPerController = data.getVar('fobHitsPerController')
                    const steamIDToPlayerController = data.getVar('steamIDToPlayerController')
                    const playerController = [ ...steamIDToPlayerController.get(res[ 2 ]) ].pop();
                    if (this.options.PLAYER_CONTROLLER_FILTER == "" || this.options.PLAYER_CONTROLLER_FILTER == playerController)
                        data.incrementFrequencyCounter('RadioHits', 0.1)
                    fobHitsPerController[ playerController ] = (fobHitsPerController[ playerController ] || 0) + 1
                    return;
                }

                regex = /LogSquadVoiceChannel: Warning: Unable to find channel for packet sender/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('unableToFindVoiceChannel', 0.005)
                    return;
                }

                regex = /DealDamage was called but there was no valid actor or component/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('dealDamageOnInvalidActorOrComponent', 1)
                    return;
                }

                regex = /TraceAndMessageClient\(\): SQVehicleSeat::TakeDamage/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('SQVehicleSeatTakeDamage', 1)
                    return;
                }

                regex = /LogSquadCommon: SQCommonStatics Check Permissions/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('SQCommonStaticsCheckPermissions', 1)
                    return;
                }

                regex = /Updated suppression multiplier/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('updatedSuppressionMultiplier', 1)
                    return;
                }

                regex = /PlayerWounded_Implementation\(\): Driver Assist Points:/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('driverAssistPoints', 1)
                    return;
                }

                regex = /Base Directory:.+\/([^\/]+)\/$/;
                res = regex.exec(line);
                if (res) {
                    data.setVar('ServerOS', res[ 1 ])
                    return;
                }

                regex = /LogNet: NotifyAcceptingConnection accepted from/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('AcceptedConnection', 0.001)
                    return;
                }
            })

            this.on('error', (err) => {
                reject(err);
            });
        });
        return this.#analysisPromise;
    }

    close() {
        this.emit('close', this.#data)
        return this.#data;
    }

    getDateTime(date) {
        const parts = date.replace(/:\d+$/, '').replace(/-/, 'T').split('T');
        parts[ 0 ] = parts[ 0 ].replace(/\./g, '-')
        parts[ 1 ] = parts[ 1 ].replace(/\./g, ':')
        const res = `${parts.join('T')}Z`;
        return new Date(res)
    }

    calcSeedingLiveTime(data, liveThreshold = 75, seedingMinThreshold = 2) {
        const prevAmountPlayersData = data.getCounterLastValue('players')

        if (!prevAmountPlayersData) return;

        if (prevAmountPlayersData.y >= liveThreshold) {
            data.setVar('SeedingDone', true)
            const prevLiveTime = data.getVar('ServerLiveTime')
            const curTime = data.getLastTimePoint().time;
            const timeDiff = +curTime - +prevAmountPlayersData.time
            data.setVar('ServerLiveTime', prevLiveTime + timeDiff)
        } else if (prevAmountPlayersData.y >= seedingMinThreshold) {
            if (data.getVar('SeedingDone')) return;
            else data.setVar('SeedingDone', false);

            const prevLiveTime = data.getVar('ServerSeedingTime')
            const curTime = data.getLastTimePoint().time;
            const timeDiff = +curTime - +prevAmountPlayersData.time
            data.setVar('ServerSeedingTime', prevLiveTime + timeDiff)
        }
    }
}