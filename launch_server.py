# -*- coding: utf-8 -*-
import sys

import server_runtime as _runtime


sys.modules[__name__] = _runtime


if __name__ == "__main__":
    _runtime.main()
