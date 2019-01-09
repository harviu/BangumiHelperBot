// rank - 获得排名
// search - 搜索
// start - 开始
// help - 显示帮助信息
const help = "\
/rank 获得当季动漫的排名\n\
/rank last  - 上一季动漫排名\n\
/rank yyyy [mm] - 特定时段排名\n\
/rank all - 所有动漫排名\n\
/search 或 直接输入名字 - 搜索\n\
/help - 显示此帮助\n\
排名信息来自http://Bangumi.tv/\
"
const cheerio = require('cheerio');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const bangumiURL = 'http://bangumi.tv';
const itemPerPage = 5; //items to show per message
const oriPerPage = 24; //items per page on bangumi.tv
let bot;

if(process.env.NODE_ENV === 'production') {
    bot = new TelegramBot(process.env.TOKEN, {
        webHook:{
            host: '0.0.0.0',
            port: process.env.PORT,
        }
    });
    bot.setWebHook(process.env.BASE_URL+process.env.TOKEN);
}
else{
    bot = new TelegramBot(process.env.TOKEN, {
        polling:true,
    });
}

console.log('Bot server started in the ' + process.env.NODE_ENV + ' mode');

let rank = {
    'all':[]
};

let keyborad = {
    inline_keyboard:[]
};

function search(msg,match){
    let param = match[1]?match[1]:match[0];
    const chatId = msg.chat.id;
    let year = 'search';
    let month = param;
    const buttons = [
        {
            text:'>>',
            callback_data:year +' '+month+' 1'
        }
    ];
    keyborad.inline_keyboard[0] = buttons;

    let back = (resp,pics)=>{
        if(!resp) resp = '似乎没有结果(つд⊂)'
        bot.sendMessage(chatId, resp,{
            parse_mode:'Markdown',
            reply_markup:keyborad,
            disable_web_page_preview:true
        });
        // send thumbnail
        // bot.sendMediaGroup(chatId,pics);
    }
    sendRank(year, month,0,back);
}

function sendRank(year,month,page,back){
    // use the back function to send the message after fetch data
    let url;
    let subRank;
    page = Number(page);
    if (year == 'all'){
        url = bangumiURL+'/anime/browser?sort=rank';
        subRank = rank.all;
    }
    else if (year>1920 && (month=='all' || (month>=1 && month<=12))){
        if (month == 'all'){
            url = bangumiURL+'/anime/browser/airtime/'+year+'?sort=rank';
            if (!rank[year]) rank[year]=[];
            subRank = rank[year];
        }else{
            url = bangumiURL+'/anime/browser/airtime/'+year+'-'+month+'?sort=rank';
            if (!rank[year+'-'+month]) rank[year+'-'+month]=[];
            subRank = rank[year+'-'+month];
        }
    }else if (year=='search'){
        url = 'http://bangumi.tv/subject_search/' + month + '?cat=2';
        if (!rank[year+'-'+month]) rank[year+'-'+month]=[];
        subRank = rank[year+'-'+month];
    }
    else{
        throw "Parameter Error";
    }

    function checkMissing(lastMissing){
        //check any not cached entry
        let missing = -1;
        let starting = parseInt(page*itemPerPage);
        let time = new Date();
        if (!subRank.lastUp || (time-subRank.lastUp)/(1000*60*60)>1){
            console.log("Refreshing cache");
            missing = starting;
        }
        else{
            for (i=starting;i<starting+itemPerPage;i++){
                if (!subRank[i]){
                    console.log("Loading nextpage");
                    missing = i;
                    break;
                }
            }
        }
        
        if (missing!=-1){
            if (missing == lastMissing){
                //means no more data
                console.log('No more page');
                let resp = "";
                for (i=starting;i<missing;i++){
                    resp+=i+1+'. ['+subRank[i].name+']('+subRank[i].link+')\n    _'
                    +subRank[i].info+'_\n    '
                    +subRank[i].rate+'/10    Rank: '+ subRank[i].rank+'\n\n';
                }
                back(resp);
            }
            else{
                // if missing item, fetch data
                oriPage = Math.floor(missing/oriPerPage);
                console.log("Fetch: "+url);
                axios.get(encodeURI(url+"&page="+(oriPage+1)))
                .then(response => {
                        const $ = cheerio.load(response.data);
                        let items = $('#browserItemList').find('li.item');
                        for (i=0;i< items.length;i++){
                            let entry={};
                            entry.name = $('h3>a', items[i]).text();
                            entry.link = bangumiURL+$('a', items[i]).attr('href');
                            entry.info = $('p.info', items[i]).text().trim();
                            entry.rank = $('.rank', items[i]).text().substr(5);
                            entry.rate = $('.rateInfo>small', items[i]).text();
                            entry.rateNo = parseInt($('.rateInfo>.tip_j', items[i]).text().substr(1));
                            entry.pic = 'http:'+$('img',items[i]).attr('src');
                            subRank[oriPage*oriPerPage+i] = entry;
                            subRank.lastUp = new Date();
                        }
                        checkMissing(missing);
                    });
            }
        }else{
            //send rank
            let resp = "";
            let album = [];
            for (i=starting;i<starting+itemPerPage;i++){
                resp+=i+1+'. ['+subRank[i].name+']('+subRank[i].link+')\n    _'
                +subRank[i].info+'_\n    '
                +subRank[i].rate+'/10    Rank: '+subRank[i].rank+'\n\n';
                photo = {
                    type:'photo',
                    media:subRank[i].pic,
                    caption:subRank[i].name,
                };
                album.push(photo);
            }
            back(resp,album);
            console.log(year+' '+month+' Sent');
        }
    }

    checkMissing(-1);
}

bot.on('callback_query',(query)=>{
    // handle page change
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const queryId = query.id;
    [year,month,page] = data.split(' ');
    let buttons=[];
    page = Number(page)
    if (page>0){
        buttons.push({
            text:'<<',
            callback_data:year +' '+month+' '+(page-1)
        })
    }
    buttons.push(
        {
            text:'>>',
            callback_data:year +' '+month+' '+(page+1)
        });
    keyborad.inline_keyboard[0] = buttons;
    let back = (resp,pics)=>{
        if (!resp){
            bot.answerCallbackQuery(queryId,{
                text:'列表似乎结束了(つд⊂)'
            })
        }else{
            // always answercallbackquery even no alart showing
            bot.answerCallbackQuery(queryId);
            bot.editMessageText(resp,{
                chat_id:chatId,
                message_id:messageId,
                parse_mode:'Markdown',
                reply_markup:keyborad,
                disable_web_page_preview:true
            });
        }
    }
    sendRank(year,month,page,back);
});

bot.onText(/\/search\s+(.*)/,search);

bot.onText(/\/start/, (msg, match) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, help);
});

bot.onText(/\/help/, (msg, match) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, help);
});

bot.onText(/\/rank\s*(\w*)\s*(\w*)/, (msg, match) => {

    year = match[1];
    if(!year) year = 'now';
    month = match[2];
    if(!month) month = 'all';

    let time = new Date();
    if(year == 'now'){
        // get this season rank
        month = Math.floor(time.getMonth()/3)*3+1;
        year = time.getFullYear();
    }
    if(year == 'last'){
        //get last season rank
        month = Math.floor(time.getMonth()/3)*3+1;
        year = time.getFullYear();
        month = month -3;
        if(month<0){
            month = month +12;
            year = year-1;
        }
    }

    const chatId = msg.chat.id;
    const buttons = [
        {
            text:'>>',
            callback_data:year +' '+month+' 1'
        }
    ];
    keyborad.inline_keyboard[0] = buttons;

    let back = (resp,pics)=>{
        if(!resp) resp = '似乎没有结果(つд⊂)'
        bot.sendMessage(chatId, resp,{
            parse_mode:'Markdown',
            reply_markup:keyborad,
            disable_web_page_preview:true
        });
        // send thumbnail
        // bot.sendMediaGroup(chatId,pics);
    }
    sendRank(year, month,0,back);
});

bot.onText(/^[^\/]+/, search);
