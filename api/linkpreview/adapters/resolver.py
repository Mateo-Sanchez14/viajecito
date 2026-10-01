import socket


class SystemResolver:
    """DNS through the OS resolver (every A and AAAA record, in order, without duplicates)."""

    def resolve(self, host: str) -> list[str]:
        try:
            infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except (socket.gaierror, UnicodeError, OSError):
            return []
        return list(dict.fromkeys(str(info[4][0]) for info in infos))
