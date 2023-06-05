const axios = require('axios').default
const md5 = require('md5')

class MultiServerAxios {
    constructor({
                    hosts = [],
                    best_server_test = '',
                    best_server_timeout = 3000,
                    best_server_interval = 60000,
                    project_key = '',
                    sign_key = '',
                } = {}) {
        if (!project_key) {
            throw new Error('project_key must have!!')
        }
        this.config = {
            hosts, sign_key,
            project_key, session_key: `${project_key}_session`,
            best_server_test, best_server_interval, best_server_timeout,
            best_server: {host: hosts[0], speed: -1, ok: false}, best_server_time: 0
        }
        this.timeConfig = {
            d: 0, t: 0
        }
        this.http = axios.create({
            baseURL: hosts[0], withCredentials: true
        })
        this.http.interceptors.request.use(async (config) => {
            config.baseURL = (await this.getBestServer()).host
            if (this.config.session_key && typeof localStorage !== "undefined") {
                const authorization = localStorage.getItem(this.config.session_key)
                if (authorization) {
                    config.headers.setAuthorization(authorization)
                }
            }
            return await this.addURLSignConfig(config)
        })

        this.http.interceptors.response.use(response => {
            if (this.config.session_key && typeof localStorage !== "undefined") {
                const authorization = response.headers.getAuthorization()
                if (authorization !== undefined) {
                    if (authorization) {
                        localStorage.setItem(this.config.session_key, authorization)
                    } else {
                        localStorage.removeItem(this.config.session_key)
                    }
                }
            }
            return response
        })
    }

    interceptors() {
        return this.http.interceptors
    }

    get(url, config) {
        return this.http.get(url, config)
    }

    post(url, data, config) {
        return this.http.post(url, data, config)
    }

    put(url, data, config) {
        return this.http.put(url, data, config)
    }

    delete(url, config) {
        return this.http.delete(url, config)
    }

    async addURLSignConfig(config, key = this.config.sign_key) {
        if (key) {
            let {baseURL, url, params = {}} = config
            if (!baseURL || !baseURL.startsWith('http')) {
                baseURL = location.origin
            }
            if (url.startsWith('/')) {
                if (!this.timeConfig.d) {
                    await this.getTimeConfig()
                }
                const ts = Math.floor((Date.now() + this.timeConfig.d) / 1000)
                const rd = Math.floor(Math.random() * 99999)
                const uid = 0
                const hash = md5([new URL(baseURL + url).pathname, ts, rd, uid, key].join('-'))
                params.sign = [ts, rd, uid, hash].join('-')
                config.params = params
            }
        }
        return config
    }

    getAllHosts() {
        if (typeof localStorage !== "undefined") {
            let cachedHosts = localStorage.getItem(`${this.config.project_key}_hosts`)
            if (cachedHosts && cachedHosts[0] === '[') {
                cachedHosts = JSON.parse(cachedHosts)
                const hostSet = new Set()
                this.config.hosts.forEach(v => hostSet.add(v))
                cachedHosts.forEach(v => hostSet.add(v))
                this.config.hosts = Array.from(hostSet)
            }
        }
    }

    getBestServer(model = 0) {
        return new Promise(resolve => {
            if (this.bestServerLock) {
                setTimeout(() => {
                    this.getBestServer(model).then(resolve)
                }, 1000)
            } else {
                this.bestServerLock = true
                this._getBestServerCore(model).then((ret) => {
                    this.bestServerLock = false
                    resolve(ret)
                })
            }
        })
    }

    // model 0 获取缓存， 1 立即刷新
    _getBestServerCore(model = 0) {
        if (this.config.best_server_test) {
            this.getAllHosts()
        }
        return new Promise(resolve => {
            if (!this.config.best_server_test) {
                this.config.best_server = {
                    host: this.config.hosts[0],
                    speed: 100,
                    ok: true
                }
                resolve(this.config.best_server)
                return
            }
            if (this.config.best_server.host.startsWith('config+')) {
                model = 1
            }
            if (model === 0 && this.config.hosts.length === 1) {
                resolve(this.config.best_server)
                this.getBestServer(2).catch(_ => _)
            } else {
                if (model === 1 || (Date.now() - this.config.best_server_time) > this.config.best_server_interval) {
                    const bestChoosers = this.config.hosts.map(host => {
                        const start = Date.now()
                        return new Promise(bestResolve => {
                            const url = `${host.replace('config+', '')}${this.config.best_server_test}`
                            const timeoutForBest = setTimeout(() => setRetValue(host, undefined, false), this.config.best_server_timeout)
                            let isReturned = false
                            const setRetValue = (host, response, ok = true, exception) => {
                                clearTimeout(timeoutForBest)
                                if (isReturned) return
                                isReturned = true
                                const speed = Date.now() - start
                                const speedResult = {host, speed, ok, exception}
                                if (response && response.headers.get('content-type').toLowerCase().indexOf('json') !== -1) {
                                    if (response.data && response.data.data && response.data.data.hosts) {
                                        if (typeof localStorage !== "undefined") {
                                            localStorage.setItem(`${this.config.project_key}_hosts`, JSON.stringify(response.data.data.hosts))
                                        }
                                    } else {
                                        speedResult.ok = false
                                    }
                                }
                                bestResolve(speedResult)
                                console.log(speedResult)
                            }
                            axios.get(url)
                                .then(response => setRetValue(host, response))
                                .catch(exception => setRetValue(host, undefined, false, exception))

                        })
                    })
                    Promise.all(bestChoosers).then(speedResults => {
                        speedResults = speedResults.sort((a, b) => {
                            if (a.speed > b.speed) {
                                return 1
                            } else if (a.speed < b.speed) {
                                return -1
                            } else {
                                return 0
                            }
                        })
                        const bestServer = speedResults.filter(v => v.ok && !v.host.startsWith('config+'))[0]
                        if (bestServer) {
                            bestServer.result = speedResults
                            this.config.best_server = bestServer.result
                            this.config.best_server_time = Date.now()
                            resolve(this.config.best_server)
                        } else {
                            setTimeout(() => {
                                this._getBestServerCore(1).then(resolve)
                            }, 500)
                        }
                    })
                } else {
                    resolve(this.config.best_server)
                }
            }
        })
    }

    getTimeConfig() {
        return new Promise((resolve) => {
            const timeURL = `https://vv.video.qq.com/checktime?otype=json&ts=${Date.now()}`
            if (!this.timeConfig.t) {
                if (typeof window === "undefined") {
                    axios.get(timeURL).then(r => {
                        const text = r.data + ''
                        this.timeConfig = JSON.parse(text.substring(text.indexOf('{'), text.length - 1))
                        this.getTimeConfig().then(resolve)
                    })
                } else {
                    if (window['QZOutputJson']) {
                        this.timeConfig = window['QZOutputJson']
                        this.getTimeConfig().then(resolve)
                    } else {
                        const oHead = document.getElementsByTagName("HEAD").item(0);
                        const oScript= document.createElement("script");
                        oScript.type = "text/javascript";
                        oScript.src=`https://vv.video.qq.com/checktime?otype=json&ts=${Date.now()}`;
                        oHead.appendChild( oScript);
                        setTimeout(() => {
                            this.getTimeConfig().then(resolve)
                        }, 500)
                    }

                }
            } else {
                this.timeConfig.d = (this.timeConfig.t * 1000) - Date.now()
                resolve(this.timeConfig)
            }
        })
    }
}

module.exports = {MultiServerAxios}