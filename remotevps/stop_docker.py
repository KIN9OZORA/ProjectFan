import paramiko

HOST = "145.79.15.108"
USER = "root"
PASS = "ILJ?F0oS/5Pi/mpR"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def run(cmd):
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode().strip())
    print(stderr.read().decode().strip())

# Stop all docker containers and remove them
run("docker stop $(docker ps -aq) || true")
run("docker rm $(docker ps -aq) || true")
# Prune docker to free space (optional, but safe for clean slate)
run("docker system prune -af --volumes || true")
# Stop Nginx from docker if it was mapped, just in case
run("systemctl restart nginx || true")

ssh.close()
print("Docker cleanup complete.")
