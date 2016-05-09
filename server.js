var http = require('http');
var fs = require('fs');

/* Create server */
http.createServer(function(request, response){
	var url = request.url;
	switch(url){
		case '/':
			getFileContents(response, 'public/home.html', 'text/html');
			break;
		case '/about':
			getFileContents(response, 'public/about.html', 'text/html');
			break;
		/*case '/contact'
			getFileContents(response, 'public/contact.html', 'text/html');
			break;*/
		default:
			response.writeHead(404, {'Content-Type':'text/plan'});
			response.end('404 - Page not found.');
	}

}).listen(9003);

/* message to check server is running or not */
console.log("Server is running on port 9003, url = http://localhost:9003");


/* function to get contents requested page from file */
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