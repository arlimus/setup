.PHONY:containers
containers:
	cd containers/claude-code && docker build -t claude-code .
