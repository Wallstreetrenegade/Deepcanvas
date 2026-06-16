# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

from pathlib import Path

from jiuwenclaw import start_services


def test_build_commands_use_source_root_when_not_package_installation(monkeypatch):
    monkeypatch.setattr(start_services, "DATA_ROOT", Path("/tmp/user-data"))
    monkeypatch.setattr(start_services, "is_package_installation", lambda: False)

    commands = start_services._build_commands("all")

    assert [cwd for _, _, cwd in commands] == [
        start_services.PACKAGE_DIR.parent,
        start_services.PACKAGE_DIR.parent,
    ]


def test_build_commands_use_data_root_when_package_installation(monkeypatch):
    data_root = Path("/tmp/user-data")
    monkeypatch.setattr(start_services, "DATA_ROOT", data_root)
    monkeypatch.setattr(start_services, "is_package_installation", lambda: True)

    commands = start_services._build_commands("all")

    assert [cwd for _, _, cwd in commands] == [data_root, data_root]
