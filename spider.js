"use strict";
var debug = require('debug')('spider');
var fs = require('fs');
var request = require('request');
var Segment = require('segment');
var segment = new Segment();

/* 初始化分词引擎，有点久 */
debug('Loading directory...');
segment
    .use('WildcardTokenizer')       // 通配符，必须在标点符号识别之前
    .use('DictTokenizer')           // 词典识别
    .use('ChsNameTokenizer')        // 人名识别，建议在词典识别之后
    .use('ChsNameOptimizer')        // 人名识别优化
    .use('DictOptimizer')           // 词典识别优化
    .loadDict('dict.txt')           // 盘古词典
    .loadDict('dict2.txt')          // 扩展词典（用于调整原盘古词典）
    .loadDict('names.txt')          // 常见名词、人名
;


//定义队列
var queue = {
    kwPage: [], //贴吧翻页队列
    pPage: [], //翻页贴子队列
};
//配置
var cfg = {};
//统计词数
var word = {};

run();

/**
* 入口
*/
function run(){
    if(!setArgument()) return ;

    for(let i=0; i<cfg.kw.length; i++){
        for(let j=0; j<cfg.kwMaxPage; j++){
            push_kwPage(encodeURI(cfg.kw[i]), j*50);
        }
    }
    grab_p_url(function(){
        grab_p_word(function(){
            /* 排序 */
            var wordIndex = Object.keys(word).sort(function(a,b){return word[b]-word[a]});
            var sortedWord = {};
            for(let i=0; i<wordIndex.length; i++){
                sortedWord[wordIndex[i]] = word[wordIndex[i]];
            }
            if(cfg.save_path && cfg.save_path !== ''){
                var file_out = {
                    generated: (new Date()).getTime(),
                    cfg: cfg,
                    data: sortedWord,
                };
                fs.writeFileSync(cfg.save_path, JSON.stringify(file_out));
            }else{
                console.log(JSON.stringify(sortedWord));
            }
        });
    });
}

function setArgument(){
    cfg = require('./config');
    var args = process.argv.splice(2);
    if(args.length%2){
        console.log('arguments error');
        return false;
    }
    for(let i=0; i<args.length; i+=2){
        if(args[i] === 'kw'){
            cfg[args[i]] = [args[i+1]];
        }else if(args[i] === 'pMaxPage'||
            args[i] === 'kwMaxPage'||
            args[i] === 'requestDelay'||
            args[i] === 'timeout'){
            cfg[args[i]] = parseInt(args[i+1]);
        }else{
            cfg[args[i]] = args[i+1];
        }
    }
    return true;
}



/**
* 传入的pn和贴吧参数一致，第一页为0，第二页为50，第三页为100
* kw 为uriencode后的
*/
function push_kwPage(kw, pn){
    queue.kwPage.unshift('http://tieba.baidu.com/f?kw='+ kw +'&ie=utf-8&pn=' + pn);
}

/**
* 传入的pn和贴子参数一致,第一页为1,第二页为2
*/
function push_pPage(pid, pn){
    queue.pPage.unshift('http://tieba.baidu.com/p/' + pid + '?pn=' + pn);
}


/**
* 从贴吧页面队列爬贴子链接加入pPage队列
*/
function grab_p_url(callback){
    var left = queue.kwPage.length;
    var total_num = left;
    var fail_num = 0;
    var cnt = 0;
    while(queue.kwPage.length > 0){
        var url = queue.kwPage.pop();
        (function(url){
            setTimeout(function(){
                (function (url){
                    request(url, { timeout: cfg.timeout }, function(err, httpRes, body){
                        left--;
                        if(err){
                            fail_num++;
                        }
                        var reg = /<a href="\/p\/(\d+)/g;
                        while(reg.exec(body)){
                            push_pPage(RegExp.$1, 1);
                        }
                        /* 异步工作全部完成 */
                        if(left === 0){
                            callback();
                        }
                    });
                })(url)
            }, (cnt++) * cfg.requestDelay);
        })(url)
    }
}


/**
* 抓取贴子内页队列的翻页链接并加入pPage队列
* 和post_content的每层楼的贴子内容并分词进行统计
*/
function grab_p_word(callback){
    var total_num = queue.pPage.length;
    var fail_num = 0;
    var success_num = 0;
    var cnt = 0;
    (function _run(){
        var url = queue.pPage.pop();
        request(url, { timeout: cfg.timeout }, function(err, httpRes, body){
            if(err){
                fail_num++;
                debug(err);
            }else{
                success_num++;
            }

            /* 翻页队列push */
            var reg = /<a href="\/p\/(\d+?)\?pn=(\d+?)">下一页<\/a>/;
            if(reg.exec(body)){
                if(parseInt(RegExp.$2) <= cfg.pMaxPage){
                    debug('add a page:' + '(' + RegExp.$1 + ')' + ',(' + RegExp.$2 + ')');
                    total_num++;
                    push_pPage(RegExp.$1, RegExp.$2);
                }
            }

            debug('SUCCESS/FAIL/TOTAL: ' + success_num + '/' + fail_num + '/' + total_num);
            /* 分词统计 */
            reg = /<div id="post_content_\d+".+?>([\s\S]+?)<\/div>/g;
            while(reg.exec(body)){
                //去掉多余标签
                word_static(RegExp.$1.replace(/<\/?.+?>/g, ''));
            }
            if(queue.pPage.length > 0){
                _run(callback);
            }else{
                debug('OVER! SUCCESS/FAIL/TOTAL: ' + success_num + '/' + fail_num + '/' + total_num);
                callback();
            }
        })
    })()
}

/**
* 分词统计
*/
function word_static(text){
    /* 折中处理，先根据字符串非中文字符进行切割，然后长度超过20的字符串分割处理 */
    var r = [];
    var str_tmp = text.replace(/(<br>)|(<img.+?>)|[ ]/g,',').split(/[^\u4e00-\u9fa5]+/);
    while(str_tmp.length > 0){
        var text_temp = str_tmp.pop();
        if(text_temp.match(/[\u4e00-\u9fa5]{2,}/)){//长度超过2才进行分词
            do {//太长的话分词会卡死，直接按长度20来分
                r.unshift(text_temp.substring(0, 20));
                text_temp = text_temp.substring(20);
            }while(text_temp.length > 20);
        }
    }

    while(r.length > 0){
        var txt = r.pop();

        var result = segment.doSegment(txt, {
            stripPunctuation:true,
        });

        for(let k=0; k<result.length; k++){
            /* 去除单字符和纯数字和数量词 */
            if(    result[k].w.length < 2
                || result[k].w.match(/^\d+$/)
                || result[k].p === 0x200000) continue;
                word[result[k].w] = word[result[k].w] ? word[result[k].w]+1 : 1;
        }
    }
}
