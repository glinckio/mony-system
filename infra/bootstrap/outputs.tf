output "bucket_estado" {
  description = "Bucket do estado do Terraform. Use em `terraform init -backend-config=\"bucket=...\"` nos ambientes."
  value       = aws_s3_bucket.estado.bucket
}

output "provedor_oidc_github" {
  description = "ARN do provedor OIDC do GitHub (os ambientes o encontram sozinhos)."
  value       = aws_iam_openid_connect_provider.github.arn
}
