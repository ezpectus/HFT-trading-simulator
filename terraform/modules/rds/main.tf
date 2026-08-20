# RDS Module — PostgreSQL for trading data

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
  description = "Private subnet IDs for RDS"
  type        = list(string)
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "trading"
}

variable "db_username" {
  description = "Database admin username"
  type        = string
  default     = "trading_admin"
}

variable "db_password" {
  description = "Database admin password"
  type        = string
  sensitive   = true
}

# Security group for RDS
resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg-${var.environment}"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
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

# DB subnet group
resource "aws_db_subnet_group" "main" {
  name        = "${var.name_prefix}-db-subnet-${var.environment}"
  subnet_ids  = var.subnet_ids
  description = "DB subnet group for ${var.environment}"

  tags = {
    Environment = var.environment
  }
}

# RDS instance
resource "aws_db_instance" "main" {
  identifier             = "${var.name_prefix}-postgres-${var.environment}"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  storage_encrypted      = true

  tags = {
    Environment = var.environment
  }
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "rds_arn" {
  value = aws_db_instance.main.arn
}
