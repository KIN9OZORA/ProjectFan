import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = "145.79.15.108"
USER = "root"
PASS = "ILJ?F0oS/5Pi/mpR"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run(cmd):
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print("OUT:", stdout.read().decode('utf-8', 'replace').strip())
    print("ERR:", stderr.read().decode('utf-8', 'replace').strip())

# Allow ports in UFW just in case
run("ufw allow 3001/tcp")
run("ufw allow 8001/tcp")
run("ufw status")

# Also check if containers are actually up
run("docker ps | grep projectfannew")
ssh.close()
