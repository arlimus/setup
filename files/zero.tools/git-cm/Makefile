BIN := git-cm

.PHONY: build install clean run

build:
	go build -o $(BIN) .

install: build
	sudo install -m 755 $(BIN) /usr/local/bin/$(BIN)

run: build
	sudo ./$(BIN)

clean:
	rm -f $(BIN)
