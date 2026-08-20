# Terraform — HFT Trading System Infrastructure

Provisions cloud infrastructure for the HFT trading system:
- VPC with public/private subnets
- EKS cluster for Kubernetes workloads
- RDS PostgreSQL for trading data
- ElastiCache Redis for caching
- S3 bucket for state and logs
- CloudWatch log groups

## Usage

```bash
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```

## Structure

```
terraform/
├── modules/
│   ├── vpc/          — VPC, subnets, NAT gateway
│   ├── eks/          — EKS cluster, node groups
│   ├── rds/          — PostgreSQL RDS instance
│   ├── elasticache/  — Redis cluster
│   └── s3/           — S3 bucket for state/logs
├── environments/
│   ├── dev/          — Development environment
│   └── prod/         — Production environment
└── README.md
```
