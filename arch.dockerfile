FROM base/archlinux
COPY arch.bootstrap.sh arch.bootstrap.sh
RUN bash arch.bootstrap.sh
