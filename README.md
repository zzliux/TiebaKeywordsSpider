### 贴吧关键词爬虫
暂时的现在是用config.js里面的文件进行配置
```js
module.exports = {
	kw: '湖南商学院',  //贴吧名
	savePath: 'files/',//保存目录
	isQueue: false,    //是否非并发爬取
	maxPage: 10,       //帖子内爬取最大页值(以防有那种几千页的帖子出现会卡死)
	hiRateNum: 100     //输出按关键词出现次数排名,取前hiRateNum个
}
```

### 安装
> npm install

### 运行
> npm start
