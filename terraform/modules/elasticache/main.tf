# ElastiCache Module — Redis for caching and pub/sub

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "hft"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for Redis"
  type        = list(string)
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

# Security group
resource "aws_security_group" "redis" {
  name        = "${var.name_prefix}-redis-sg-${var.environment}"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = var.environment
  }
}

# Subnet group
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.name_prefix}-redis-subnet-${var.environment}"
  subnet_ids  = var.subnet_ids
  description = "Subnet group for Redis ${var.environment}"
}

# Redis replication group
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.name_prefix}-redis-${var.environment}"
  description                = "Redis cluster for ${var.environment}"
  node_type                  = var.node_type
  num_cache_clusters         = 2
  parameter_group_name       = "default.redis7"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = {
    Environment = var.environment
  }
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_arn" {
  value = aws_elasticache_replication_group.main.arn
}
