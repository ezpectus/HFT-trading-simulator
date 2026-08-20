# Prod environment — production infrastructure with higher capacity

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "hft-trading-tfstate-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "hft-trading-tflock-prod"
  }
}

provider "aws" {
  region = "us-east-1"
}

# Variables — must be provided via tfvars or -var
variable "db_password" {
  description = "RDS master password (MUST be provided via -var or tfvars)"
  type        = string
  sensitive   = true
}

# Modules — production sizing
module "vpc" {
  source             = "../../modules/vpc"
  name_prefix        = "hft-prod"
  environment        = "prod"
  vpc_cidr           = "10.1.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

module "eks" {
  source             = "../../modules/eks"
  name_prefix        = "hft-prod"
  environment        = "prod"
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = concat(module.vpc.public_subnet_ids, module.vpc.private_subnet_ids)
  node_instance_type = "c5.2xlarge"
  node_desired_size  = 4
  node_min_size      = 2
  node_max_size      = 10
}

module "rds" {
  source              = "../../modules/rds"
  name_prefix         = "hft-prod"
  environment         = "prod"
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnet_ids
  db_instance_class   = "db.r6g.large"
  db_allocated_storage = 100
  db_password         = var.db_password
}

module "elasticache" {
  source      = "../../modules/elasticache"
  name_prefix = "hft-prod"
  environment = "prod"
  vpc_id      = module.vpc.vpc_id
  subnet_ids  = module.vpc.private_subnet_ids
  node_type   = "cache.r6g.large"
}

module "s3" {
  source      = "../../modules/s3"
  name_prefix = "hft-prod"
  environment = "prod"
  bucket_name = "hft-trading-logs-prod"
}

# Outputs
output "cluster_endpoint" {
  value     = module.eks.cluster_endpoint
  sensitive = true
}

output "rds_endpoint" {
  value     = module.rds.rds_endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = module.elasticache.redis_endpoint
  sensitive = true
}

output "s3_bucket" {
  value = module.s3.bucket_name
}
