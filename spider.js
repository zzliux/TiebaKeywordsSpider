var Segment = require('segment');
var segment = new Segment();
var req = require('superagent');
var fs = require('fs');
var cfg = require('./config');

var kw = cfg.kw;
var savePath = cfg.savePath;
var isQueue = cfg.isQueue;
var maxPage = cfg.maxPage;

console.log('Loading Dictory dictionary');
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

var startTime = (new Date()).getTime();


var url = 'http://tieba.baidu.com/f?kw=' + encodeURI(kw);
var word = {};
var edLength = 0;


req.get(url).end(function(err, res){
	if(err){
		console.log('err');
	}else{
		var reg = /<a href="(\/p\/\d+?)"/g;
		var r = [];
		while(reg.exec(res.text)){
			r.push('http://tieba.baidu.com' + RegExp.$1);
		}
		statistic(0);
		function statistic(i){
			if(i >= r.length) {
				return;
			}else{
				console.log('Crawling(' + i + '):' + r[i]);
				req.get(r[i]).end(function(err2, res2){
					if(err2){
						console.log(err2.message);
						statistic(i+1);
						return;
					}
					edLength++;
					/* 翻页爬取 */
					var reg3 = /<a href="\/p\/(\d+?)\?pn=(\d+?)">下一页<\/a>/;
					if(reg3.exec(res2.text) && RegExp.$2 < maxPage){
						r.push('http://tieba.baidu.com/p/'+RegExp.$1+'?pn=' + RegExp.$2);
						console.log('Add page:' + '/p/'+RegExp.$1+'?pn=' + RegExp.$2 + ',Queue length:' + (r.length - edLength));
						statistic(r.length - 1);
					}

					/* 帖子内容爬取 */
					var r2 = [];
					var reg2 = /<div id="post_content_\d+".+?>(.+?)<\/div>/g;
					while(reg2.exec(res2.text)){
						// if(RegExp.$1.length > 500) continue;
						var arr_t = (RegExp.$1).replace(/(<br>)|(<img.+?>)|[ ]/g,',').split(/[^\u4e00-\u9fa5]+/);
						for(var j=0; j<arr_t.length; j++){
							if(arr_t[j].length > 1 && arr_t[j].length < 50){
								r2.push(arr_t[j]);
							}
						}
					}
					for(var j=0; j<r2.length; j++){
						var result = segment.doSegment(r2[j],{
							stripPunctuation:true,
						});
						for(var k=0; k<result.length; k++){
							//去除单字符和纯数字和数量词
							if(    result[k].w.length<2
								|| result[k].w.match(/^\d+$/)
								|| result[k].p === 0x200000) continue;
							word[result[k].w] = word[result[k].w] ? word[result[k].w]+1 : 1;
						}
					}
					if(edLength >= r.length){
						fs.writeFile(savePath + kw +'.kw',JSON.stringify(word),{encoding:'UTF-8',flag:'w+'},function(){
							console.log('over!');
							var endTime = (new Date()).getTime();
							console.log('Crawling time:' + (endTime - startTime)/1000 + 's');
							var out = require('./show');
							var outPath = savePath + kw + '(' +  (new Date()).getTime() + ').info';
							fs.writeFile(outPath, JSON.stringify(out), {encoding:'UTF-8',flag:'w+'}, function(){
								console.log('Writed to path(' + outPath + ') success!');
							});
						});
					}
					console.log('Over(' + i + '),Queue length:' + (r.length - edLength));
					if(isQueue)
						statistic(i+1);
				});
				if(!isQueue)
					statistic(i+1);
			}
		}
	}
});