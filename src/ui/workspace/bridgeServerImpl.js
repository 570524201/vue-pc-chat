import WebSocket from 'ws'
import {remote} from "../../platform";

/**
 * 大概流程
 *  采用类 client-server 模式实现开发平台 js sdk，有两部分相关代码：
 * 1. client 运行在工作台所加载的 webview 里面
 * 2. server 直接运行在工作台页面里面，也就是主窗口的渲染进程
 * 3. client 和 server 之间的交互，通过 websocket 进行中转
 *
 */


let handlers;
let client;
let mAppUrl;
let mWfc;
let mHostPage;

export function init(appUrl, wfc, hostPage, wsPort) {
    mAppUrl = appUrl;
    mWfc = wfc;
    mHostPage = hostPage;
    client = new WebSocket('ws://127.0.0.1:' + wsPort + '/');
    client.on('message', (data) => {
        let obj;
        try {
            obj = JSON.parse(data);
        } catch (e) {
            console.error('parse ws data error', e);
            return;
        }
        if (remote.getCurrentWindow().getMediaSourceId() !== obj.windowId) {
            return;
        }
        //let obj = {type: 'wf-op-request', requestId, handlerName, args};
        console.log('wf-op-request', mAppUrl, obj)
        if (obj.type === 'wf-op-request') {
            if (handlers[obj.handlerName]) {
                handlers[obj.handlerName](obj.args, obj.requestId);
            } else {
                console.log('wf-op-request, unknown handlerName', obj.handlerName);
            }
        }
    })

    handlers = {
        'toast': toast,
        'openUrl': openUrl,
        'getAuthCode': getAuthCode,
        'config': config,
        'chooseContacts': chooseContacts,
        'close': close,
    }
}

let openUrl = (args) => { // addTab or open new window?
    console.log('openUrl', mAppUrl, args)
    // 直接从工作台打开的，addTab
    // 从应用打开的，new window
    if (args.external) {
        args.appUrl = mAppUrl;
        mHostPage.openExternal(args);
        return;
    }
    mHostPage.addTab(args)
}

let getAuthCode = (args, requestId) => {
    let host = args.host;
    if (host.indexOf(':')) {
        host = host.substring(0, host.indexOf(':'))
    }
    mWfc.getAuthCode(args.appId, args.appType, host, (authCode) => {
        console.log('authCode', authCode);
        _response('getAuthCode', requestId, 0, authCode);
    }, (err) => {
        console.log('getAuthCode error', err);
        _response('getAuthCode', requestId, err)
    })
}

let config = (args) => {
    mWfc.configApplication(args.appId, args.appType, args.timestamp, args.nonceStr, args.signature, () => {
        console.log('config success');
        _notify('ready')

    }, (err) => {
        console.log('config failed');
        _notify('error', err)
    })
}

let chooseContacts = (args, requestId) => {
    mHostPage.chooseContacts(args, (users) => {
        _response('chooseContacts', requestId, 0, users);
    }, (err) => {
        _response('chooseContacts', requestId, err, 'user canceled');
    })
}

let close = () => {
    remote.getCurrentWindow().close();
}

let toast = (text) => {
    mHostPage.$notify({
        title: '提示',
        text: text,
        type: 'warn'
    });

}

function _response(handlerName, requestId, code, data) {
    let obj = {
        type: 'wf-op-response',
        handlerName,
        requestId,
        windowId: remote.getCurrentWindow().getMediaSourceId(),
        args: {
            code,
            data
        },
    }
    console.log('send response', obj)
    client.send(JSON.stringify(obj));
}

function _notify(handlerName, args) {
    let obj = {
        type: 'wf-op-event',
        handlerName,
        windowId: remote.getCurrentWindow().getMediaSourceId(),
        args
    }
    console.log('send event', obj)
    client.send(JSON.stringify(obj));
}


