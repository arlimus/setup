FROM base/archlinux
COPY arch.bootstrap.sh arch.bootstrap.sh
COPY . /tmp/setup
RUN bash arch.bootstrap.sh
