#!/usr/bin/env node

var http = require('http');
var fs = require('fs');
var path = require('path');
var parseUrl = require('url').parse;

function getUsers() {
    return {
        'secret': 'pass',
        'root': 'root',
        'javi': 'javi',
        'presenter1': 'presenter1',
        'presenter2': 'presenter2',
    }
}

function getPollDefinitions() {
    return [
        {
            id: 0,
            title: 'Talk on something very techie.',
            questions: [
                {
                    type: 'update',
                    title: 'Do you like JS?',
                    id: 0,
                    responses: [
                        {
                            id: 0,
                            text: "Yes! JS is amazing. Best ever!",
                            count: 0
                        },
                        {
                            id: 1,
                            text: "Yes... but it has its pros and cons...",
                            count: 0
                        },
                        {
                            id: 2,
                            text: "Not a lot... coding everywhere with the same language helps.",
                            count: 0
                        },
                        {
                            id: 3,
                            text: "Nope! it is such an ugly language!",
                            count: 0
                        }
                    ]
                },
                {
                    type: 'update',
                    title: 'JS, Python or Java?',
                    id: 1,
                    responses: [
                        {
                            id: 0,
                            text: "JS always!",
                            count: 0
                        },
                        {
                            id: 1,
                            text: "Python, batteries included.",
                            count: 0
                        },
                        {
                            id: 2,
                            text: "Java & XML for the win.",
                            count: 0
                        },
                        {
                            id: 3,
                            text: "Those are toys... I prefer BrainFuck",
                            count: 0
                        }
                    ]
                }
            ]
        }
    ];
}

function authorize(user, pass) {
    console.log('>> user %s trying to login', user);
    presenterId = ""+Date.now();
    var authorized = getUsers()[user] === pass;
    console.log('<< user %s is authorized: %s', user, authorized);
    return authorized;
}

var currentPollId = 0;
var currentPoll = getPollDefinitions()[currentPollId];
var currentQuestion = 0;
var clientResponses = [];
var presenterId = null;
var users = 0;

function getCurrentQuestion() {
    return currentPoll.questions[currentQuestion];
}

function updateClients(responses, object) {
    responses.forEach(function (response) {
        response.write('data: '+JSON.stringify(object)+'\n\n');
    })
}

function httpNotFound(req, res) {
    res.writeHead(404);
    res.end();
}

function decorateWithBody(func, req, res) {
    var body = '';
    req.on('data', function(chunk) {
        body += chunk;
    });

    req.on('end', function() {
        try {
            req.json = JSON.parse(body);
        } catch (err) {}
        req.body = body;
        func(req, res);
    });
    return function(){};

}

var router = {
    getRoutes: [],
    postRoutes: [],
    post: function(path, func) {
        this.postRoutes.push({path: path, func: func})
    },
    get: function(path, func) {
        this.getRoutes.push({path: path, func: func})
    },
    routeFor: function(req, res){
        var route;
        var routesArrName = req.method.toLowerCase()+'Routes';
        var routes = this[routesArrName];
        var funcToApply = this.findMatch(routes, req);
        console.log(' ++ funcToApply', funcToApply.name);
        route = decorateWithBody(funcToApply, req, res);
        return route;
    },
    findMatch: function(routes, req){
        var url = req.parsedUrl.pathname;
        console.log('>>>> req.parsedUrl', url, req.method);
        var route = httpNotFound;
        var currRoute;
        //return this.getRoutes[0].func; //TODO: IMPLEMENT.
        for(var i = 0; i < routes.length; i ++){
            currRoute = routes[i];
            console.log('checking:', url, 'against:', currRoute.path);
            if (currRoute.path === url) {
                console.log('Found route!');
                route = currRoute.func;
                break;
            }
        }
        return route;
    },
    route: function() {
        return function(req, res) {
            req.parsedUrl = parseUrl(req.url, true);
            var func = this.routeFor(req, res);
            func(req, res);
        }.bind(this);
    }
};

function getIndex(req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    var page = fs.readFileSync(path.join(__dirname, 'page.html'), {encoding: 'utf8'});
    var user=req.parsedUrl.query.user;
    var pass=req.parsedUrl.query.pass;

    if (user && pass) {
        if ( authorize(user, pass)) {
            page = page.replace('<!-- presenter-id -->', presenterId);
            //TODO: render an html piece in a page.
            var presenterButtonsHtml = '<input type="button" id="page-prev" class="response-btn" name="prev" value="< prev" onclick="submitPagingRequest(\'prev\')">' +
                '<input type="button" id="page-next" class="response-btn" name="next" value="next >" onclick="submitPagingRequest(\'next\')">';
            page = page.replace('<!-- presenter-sect -->', presenterButtonsHtml);
        } else {
            res.writeHead(401, {'Content-Type': 'text/html'});
            res.end('Unauthorized');
        }
    } else {
        console.log('========>>> generating user page.');
        users += 1;
        page = page.replace('<!-- presenter-id -->', 'happy-user-'+users);
    }

    return res.end(page);
}

function getPoll(req, res) {
    clientResponses.push(res);
    console.log('>>>>', req.url, req.headers);
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    var currQuestion = getCurrentQuestion();
    console.log('#############################################################currQuestion', currQuestion);
    updateClients(clientResponses, currQuestion);
    return;
}

function postResponse (req, res) {
    var question = getCurrentQuestion();
    var pollResponse = req.json;
    console.log('***** response: question:', pollResponse.question, 'response:', pollResponse.response);
    if(typeof pollResponse.question === 'number' && typeof pollResponse.response === 'number' ) {
        console.log('***** correct response: question:', pollResponse.question, 'response:', pollResponse.response);

        if(question.id === pollResponse.question && pollResponse.response <= question.responses.length - 1) {
            console.log('*** question and response found. counting.');
            question.responses[pollResponse.response].count += 1;
            updateClients(clientResponses, question);
            res.writeHead(200, "OK", {'Content-Type': 'text/html'});
        } else {
            var msg = "Not found: curr question: "+question.id+" max response: "+ question.responses.length -1;
            console.log('*** '+ msg);
            res.writeHead(404, msg, {'Content-Type': 'text/html'});
        }

    } else {
        var msg = ">>> could not parse question correctly :-(";
        console.log('====' + msg);
        res.writeHead(400, msg, {'Content-Type': 'text/html'});
    }
    res.end();

    return;

}

function postPagination(req, res){
    //curl -X POST --data '{"userId": "lksdjflsdkjf"}' http://localhost:8125/prev -v
    //curl -X POST --data '{"userId": "lksdjflsdkjf"}' http://localhost:8125/next -v
    var urlPath = req.parsedUrl.pathname;
    var isPageNextReq = urlPath.indexOf('next') !== -1;
    var isPagePrevReq = urlPath.indexOf('prev') !== -1;

    var pagingRequest = req.json;
    if (pagingRequest.userId !== presenterId) {//TODO: proper auth system.
        var msg = '%%%==> pagingRequest NOT authorized: userId: '+pagingRequest.userId+' presenterId: ' + presenterId;
        console.log(msg, pagingRequest);

        res.writeHead(401, msg, {'Content-Type': 'text/html'});
        return res.end();
    }
    console.log('%%%==> pagingRequest authorized', pagingRequest, urlPath);
    res.writeHead(204, "Done.", {'Content-Type': 'text/html'});
    res.end();
    if(isPageNextReq) {
        console.log('=========>>>>> NEXT');
        var numberOfPolls = currentPoll.questions.length;
        if(currentQuestion < numberOfPolls -1) {
            currentQuestion += 1;
        }
    } else {
        console.log('=========>>>>> PREV');
        if(currentQuestion > 0) {
            currentQuestion -= 1;
        }
    }
    updateClients(clientResponses, getCurrentQuestion());

    return;
}

router.get('/', getIndex);
router.get('/index.html', getIndex);
router.get('/poll', getPoll);
router.post('/response', postResponse);
router.post('/next', postPagination);
router.post('/prev', postPagination);

http.createServer(router.route()).listen(8126, "0.0.0.0");
console.log('Server running at http://0.0.0.0:8126/');