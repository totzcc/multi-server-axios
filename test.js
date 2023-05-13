const {MultiServerAxios} = require('./index')

const multiServerAxios = new MultiServerAxios({
    hosts: [
        'https://www.google.com', 'https://www.google.cn',
        'https://www.baidu.com', 'https://www.hao123.com', 'https://www.check-host.net',
        'https://vv.video.qq.com', 'https://config.ganzb.com.cn', 'https://www.it1352.com',
        'https://juejin.cn'
    ],
    best_server_test: '/',
    best_server_interval: 2000,
    best_server_timeout: 1000,
    cdn_key: 'abc',
    project_key: 'test'
})

function a1() {
    multiServerAxios.getTimeConfig().then(r => {
        console.log(r)
    })
}

function a2() {
    const aaa = () => {
        multiServerAxios.getBestServer().then(r1 => {
            console.log(Date.now(), r1);
        })
    }
    aaa()
}

function a3() {
    multiServerAxios.get('/abc').catch(_ => _)
}

a3()