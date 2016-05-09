/*************************************************/
/*This http server will handle requests by client*/
/*************************************************/

/*Global variables required to create http server*/
var http = require('http');
var fs = require('fs');


/* Create server */
/* Two parameter required: request and response */
http.createServer(function(request, response){
	var url = request.url;
	switch(url){
		case '/':
			getFileContents(response, 'public/index.html', 'text/html');
			break;
		case '/about':
			getFileContents(response, 'public/about.html', 'text/html');
			break;
		case '/contact':
			getFileContents(response, 'public/contact.html', 'text/html');
			break;
		default:
			response.writeHead(404, {'Content-Type':'text/plan'});
			response.end('404 - Page not found.');
	}

}).listen(9003);

/* Message for verification of server is running or not */
console.log("Server is running on port 9003, url = http://localhost:9003");


/* Function to get contents requested page from file - Helper method */
function getFileContents(response, filePath, contentType){
	fs.readFile(filePath, function(error, data){
		if(error) {
			response.writeHead(500, {'Content-Type':'text/plan'});
			response.end('500 - Internal Server Error');
		}
		else{
			response.writeHead(200, {'Content-Type':'text/html'});
			response.end(data);
		}
	});
}