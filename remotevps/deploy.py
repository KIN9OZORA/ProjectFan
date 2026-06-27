import paramiko
import zipfile
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = "145.79.15.108"
USER = "root"
PASS = "ILJ?F0oS/5Pi/mpR"

print("Zipping project files...")
def zipdir(path, ziph, exclude_dirs, prefix=""):
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, os.path.join(path, '..'))
            if prefix:
                rel_path = os.path.join(prefix, rel_path)
            ziph.write(file_path, rel_path)

zipf = zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED)
exclude = ['node_modules', 'venv', '__pycache__', '.next', '.git']
zipdir('backend', zipf, exclude)
zipdir('frontend', zipf, exclude)
zipdir('mosquitto', zipf, exclude)
zipf.write('docker-compose.yml', 'docker-compose.yml')
zipf.write('nginx.conf', 'nginx.conf')
zipf.close()
print("Zip complete: deploy.zip")

print("Connecting to VPS via SSH...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
print("Connected!")

def run(cmd):
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', 'replace').strip()
    err = stderr.read().decode('utf-8', 'replace').strip()
    if out: print(f"OUT: {out}")
    if err: print(f"ERR: {err}")
    if exit_status != 0:
        print(f"Command failed with status {exit_status}")
    return exit_status, out

print("Uploading deploy.zip to /root/deploy_new.zip...")
sftp = ssh.open_sftp()
sftp.put('deploy.zip', '/root/deploy_new.zip')
sftp.close()
print("Upload complete!")

commands = [
    "mkdir -p /root/ProjectFanNew",
    "unzip -o -q /root/deploy_new.zip -d /root/ProjectFanNew",
    "docker stop projectfan-nginx projectfan-backend projectfan-frontend projectfan-db || true",
    "docker rm projectfan-nginx projectfan-backend projectfan-frontend projectfan-db || true",
    "cd /root/ProjectFanNew && docker compose down || true",
    "cd /root/ProjectFanNew && docker compose up --build -d"
]

for cmd in commands:
    run(cmd)

print("Deployment Script Completed successfully!")
ssh.close()
