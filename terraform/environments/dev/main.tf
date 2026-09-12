# Dev environment — composes all modules for development infrastructure

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "hft-trading-tfstate-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "hft-trading-tflock-dev"
  }
}

provider "aws" {
  region = "us-east-1"
}

# Modules
module "vpc" {
  source             = "../../modules/vpc"
  name_prefix        = "hft-dev"
  environment        = "dev"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

module "eks" {
  source            = "../../modules/eks"
  name_prefix       = "hft-dev"
  environment       = "dev"
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = concat(module.vpc.public_subnet_ids, module.vpc.private_subnet_ids)
  node_instance_type = "t3.medium"
  node_desired_size  = 2
  node_min_size      = 1
  node_max_size      = 4
}

module "s3" {
  source      = "../../modules/s3"
  name_prefix = "hft-dev"
  environment = "dev"
  bucket_name = "hft-trading-logs-dev"
}

# Outputs
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "s3_bucket" {
  value = module.s3.bucket_name
}
