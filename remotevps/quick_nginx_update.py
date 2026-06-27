import paramiko
import os

HOST = "145.79.15.108"
USER = "root"
PASS = "ILJ?F0oS/5Pi/mpR"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Read the local nginx.conf
with open("e:\\Development Project\\ProjectFan\\nginx.conf", "r", encoding="utf-8") as f:
    content = f.read()

# Write to a temporary file on VPS and then move it
sftp = ssh.open_sftp()
with sftp.open("/root/ProjectFanNew/nginx.conf", "w") as f:
    f.write(content)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("docker restart projectfannew-nginx-1")
print(stdout.read().decode())
ssh.close()
print("Nginx updated and restarted successfully!")
