const axios = require('axios')
const md5 = require('md5')

class MultiServerAxios {
    constructor({
                    dev_host = 'http://localhost',
                    hosts = [],
                    best_server_test = '/hosts',
                    best_server_timeout = 3000,
                    best_server_interval = 60000,
                    session_key = '',
                    sign_key = '',
                } = {}) {
        this.config = {
            dev_host, hosts, session_key, sign_key,
            best_server_test, best_server_interval, best_server_timeout,
            best_server: {host: hosts[0], speed: -1, ok: true}, best_server_time: 0
        }
        this.timeConfig = {
            d: 0, t: 0
        }
        this.http = axios.create({
            baseURL: hosts[0], withCredentials: true
        })
        this.http.interceptors.request.use(config => {
            if (this.config.session_key && typeof localStorage !== "undefined") {
                const authorization = localStorage.getItem(this.config.session_key)
                if (authorization) {
                    config.headers.setAuthorization(authorization)
                }
            }
            return this.addURLSignConfig(config)
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
            const {baseURL, url, params = {}} = config
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

    getBestServer(focus = false) {
        return new Promise(resolve => {
            if (this.config.hosts.length === 1) {
                resolve(this.config.best_server)
            } else {
                if (focus || (Date.now() - this.config.best_server_time) > this.config.best_server_interval) {
                    const bestChoosers = this.config.hosts.map(host => {
                        const start = Date.now()
                        return new Promise(bestResolve => {
                            const url = `${host}${this.config.best_server_test}`
                            let isReturned = false
                            const setRetValue = (host, response, ok = true) => {
                                if (isReturned) return
                                isReturned = true
                                if (response && response.data[0] === '{' && response.headers.get('content-type').toLowerCase().indexOf('json') !== -1) {
                                    const remoteHostsConfig = JSON.parse(response.data)
                                    if (remoteHostsConfig.data.hosts) {
                                        this.config.hosts = remoteHostsConfig.data.hosts
                                    }
                                }
                                const speed = Date.now() - start
                                bestResolve({host, speed, ok})
                            }
                            axios.get(url).then(response => setRetValue(host, response)).catch(_ => _)
                            setTimeout(() => {
                                setRetValue(host, undefined, false)
                            }, this.config.best_server_timeout)
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
                        const bestServer = speedResults.filter(v => v.ok)[0]
                        if (bestServer) {
                            this.config.best_server = {...bestServer, results: speedResults}
                            this.config.best_server_time = Date.now()
                        }
                        resolve(this.config.best_server)
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
                        document.write(`<script src="${timeURL}"></script>`);
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